import { createHash } from 'node:crypto';

export const FIFO_COST_METHOD = 'FIFO-1';
const QUANTITY_SCALE = 6;
const COST_SCALE = 8;
const VALUE_SCALE = QUANTITY_SCALE + COST_SCALE;
const decimalLimit = 10n ** 38n;
const inbound = new Set(['OPENING', 'RECEIPT', 'ADJUSTMENT_IN']);
const outbound = new Set(['SALE', 'PURCHASE_RETURN', 'ISSUE', 'ADJUSTMENT_OUT', 'TRANSFER']);
const orderText = (first, second) => first < second ? -1 : first > second ? 1 : 0;

class FifoInputError extends Error {
  constructor(code, movementId) {
    super(code);
    this.code = code;
    this.movementId = movementId;
  }
}

function unsignedDecimal(value, scale, precision, movementId) {
  const match = typeof value === 'string' && /^(\d+)(?:\.(\d+))?$/.exec(value);
  if (!match) throw new FifoInputError('DECIMAL_REQUIRED', movementId);
  const whole = match[1].replace(/^0+(?=\d)/, '');
  const fractional = match[2] ?? '';
  if (whole.length > precision - scale || fractional.length > scale) {
    throw new FifoInputError('DECIMAL_OUT_OF_RANGE', movementId);
  }
  return BigInt(whole + fractional.padEnd(scale, '0'));
}

function decimal(value, scale) {
  const digits = value.toString().padStart(scale + 1, '0');
  return `${digits.slice(0, -scale)}.${digits.slice(-scale)}`;
}

function utc(value, movementId) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) ||
      !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) {
    throw new FifoInputError('CANONICAL_TIMESTAMP_REQUIRED', movementId);
  }
  return value;
}

function identity(value, maxLength, movementId) {
  if (typeof value !== 'string' || !value.length || value.trim() !== value || value.length > maxLength) {
    throw new FifoInputError('OFFICIAL_IDENTITY_REQUIRED', movementId);
  }
  return value;
}

function valueOf(quantity, unitCost, movementId) {
  const value = quantity * unitCost;
  if (value >= decimalLimit) throw new FifoInputError('VALUATION_OUT_OF_RANGE', movementId);
  return value;
}

/** Rebuild a single official product, base unit and currency across its covered warehouses.
 * The adapter supplies the accepted opening quantities/layers and the complete normalized ERP stream.
 * No partial result is publishable. Corrections require replay of the full compatible source window.
 */
export function rebuildFifo(input) {
  try {
    if (!input || typeof input !== 'object') throw new FifoInputError('SOURCE_WINDOW_REQUIRED');
    const sourceSystemCode = identity(input.sourceSystemCode, 40);
    const productExternalId = identity(input.productExternalId, 200);
    const unitCode = identity(input.unitCode, 40);
    const currencyCode = identity(input.currencyCode, 3);
    if (!/^[A-Z]{3}$/.test(currencyCode) || !/^[A-Za-z0-9._-]+$/.test(sourceSystemCode)) {
      throw new FifoInputError('OFFICIAL_IDENTITY_REQUIRED');
    }
    const sourceProof = identity(input.sourceProof, 200);
    if (!/^[1-9]\d{0,19}$/.test(typeof input.sourceRevision === 'string' ? input.sourceRevision : '')) {
      throw new FifoInputError('SOURCE_REVISION_REQUIRED');
    }
    const sourceRevision = input.sourceRevision;
    const periodStartUtc = utc(input.periodStartUtc);
    const throughUtc = utc(input.throughUtc);
    if (periodStartUtc > throughUtc || !Array.isArray(input.movements) ||
        !Array.isArray(input.openingWarehouses) || !input.openingWarehouses.length) {
      throw new FifoInputError('SOURCE_WINDOW_REQUIRED');
    }
    const warehouseIds = input.openingWarehouses.map(value => identity(value, 200));
    const warehouses = new Map(warehouseIds.map(id => [id, { layers: [], cursor: 0, quantity: 0n }]));
    if (warehouses.size !== warehouseIds.length) throw new FifoInputError('DUPLICATE_WAREHOUSE');
    const seen = new Set();
    const movements = input.movements.map(raw => {
      if (!raw || typeof raw !== 'object') throw new FifoInputError('OFFICIAL_IDENTITY_REQUIRED');
      const id = identity(raw.id, 200);
      if (seen.has(id)) throw new FifoInputError('DUPLICATE_MOVEMENT', id);
      seen.add(id);
      const documentId = identity(raw.documentId, 200, id);
      const lineId = identity(raw.lineId, 200, id);
      const at = utc(raw.at, id);
      if (at < periodStartUtc || at > throughUtc || (raw.kind === 'OPENING' && at !== periodStartUtc)) {
        throw new FifoInputError('MOVEMENT_OUTSIDE_WINDOW', id);
      }
      if (raw.unitCode !== unitCode || raw.currencyCode !== currencyCode) throw new FifoInputError('UNIT_OR_CURRENCY_MISMATCH', id);
      if (!warehouses.has(raw.warehouseId)) throw new FifoInputError('OPENING_NOT_AVAILABLE', id);
      if (typeof raw.sequence !== 'string' || !/^\d{1,20}$/.test(raw.sequence)) throw new FifoInputError('SOURCE_ORDER_REQUIRED', id);
      if (!inbound.has(raw.kind) && !outbound.has(raw.kind) && raw.kind !== 'SALE_RETURN') throw new FifoInputError('UNSUPPORTED_MOVEMENT', id);
      const quantity = unsignedDecimal(raw.quantity, QUANTITY_SCALE, 28, id);
      if (quantity === 0n) throw new FifoInputError('QUANTITY_REQUIRED', id);
      const unitCost = inbound.has(raw.kind) ? unsignedDecimal(raw.unitCost, COST_SCALE, 28, id) : null;
      return {
        id, documentId, lineId, at, kind: raw.kind, sequence: BigInt(raw.sequence), quantity, unitCost,
        warehouseId: raw.warehouseId, destinationWarehouseId: raw.destinationWarehouseId ?? null,
        originalSaleId: raw.originalSaleId ?? null,
      };
    }).sort((first, second) => orderText(first.at, second.at)
      || Number(second.kind === 'OPENING') - Number(first.kind === 'OPENING')
      || orderText(first.sequence, second.sequence) || orderText(first.id, second.id));

    const layers = [];
    const consumptions = [];
    const sales = new Map();
    const addLayer = (warehouseId, movement, quantity, unitCost, originConsumptionNo = null) => {
      valueOf(quantity, unitCost, movement.id);
      const warehouse = warehouses.get(warehouseId);
      const layer = { layerNo: layers.length + 1, warehouseId, movement, quantity, unitCost, remaining: quantity, originConsumptionNo };
      layers.push(layer);
      warehouse.layers.push(layer);
      warehouse.quantity += quantity;
      if (warehouse.quantity >= 10n ** 28n) throw new FifoInputError('QUANTITY_OUT_OF_RANGE', movement.id);
    };
    const consume = (movement) => {
      const warehouse = warehouses.get(movement.warehouseId);
      if (movement.quantity > warehouse.quantity) throw new FifoInputError('INSUFFICIENT_STOCK', movement.id);
      let remaining = movement.quantity;
      const slices = [];
      while (remaining > 0n) {
        const layer = warehouse.layers[warehouse.cursor];
        const quantity = layer.remaining < remaining ? layer.remaining : remaining;
        const consumption = { consumptionNo: consumptions.length + 1, layer, movement, quantity, returned: 0n };
        valueOf(quantity, layer.unitCost, movement.id);
        consumptions.push(consumption);
        slices.push(consumption);
        layer.remaining -= quantity;
        warehouse.quantity -= quantity;
        remaining -= quantity;
        if (layer.remaining === 0n) warehouse.cursor++;
      }
      return slices;
    };

    for (const movement of movements) {
      if (inbound.has(movement.kind)) {
        addLayer(movement.warehouseId, movement, movement.quantity, movement.unitCost);
      } else if (movement.kind === 'SALE_RETURN') {
        const original = sales.get(identity(movement.originalSaleId, 200, movement.id));
        if (!original) throw new FifoInputError('ORIGINAL_SALE_REQUIRED', movement.id);
        let remaining = movement.quantity;
        for (const slice of original) {
          const available = slice.quantity - slice.returned;
          const quantity = available < remaining ? available : remaining;
          if (quantity > 0n) addLayer(movement.warehouseId, movement, quantity, slice.layer.unitCost, slice.consumptionNo);
          slice.returned += quantity;
          remaining -= quantity;
          if (remaining === 0n) break;
        }
        if (remaining > 0n) throw new FifoInputError('RETURN_EXCEEDS_SALE', movement.id);
      } else {
        if (movement.kind === 'TRANSFER' &&
            (!warehouses.has(movement.destinationWarehouseId) || movement.warehouseId === movement.destinationWarehouseId)) {
          throw new FifoInputError('TRANSFER_DESTINATION_REQUIRED', movement.id);
        }
        const slices = consume(movement);
        if (movement.kind === 'SALE') sales.set(movement.id, slices);
        if (movement.kind === 'TRANSFER') {
          for (const slice of slices) {
            addLayer(movement.destinationWarehouseId, movement, slice.quantity, slice.layer.unitCost, slice.consumptionNo);
          }
        }
      }
    }

    const valuations = [...warehouses].sort(([a], [b]) => orderText(a, b)).map(([warehouseId, warehouse]) => {
      const value = warehouse.layers.reduce((sum, layer) => sum + valueOf(layer.remaining, layer.unitCost, layer.movement.id), 0n);
      if (value >= decimalLimit) throw new FifoInputError('VALUATION_OUT_OF_RANGE');
      return { warehouseId, quantity: decimal(warehouse.quantity, QUANTITY_SCALE), value: decimal(value, VALUE_SCALE) };
    });
    const toJson = (_, value) => typeof value === 'bigint' ? value.toString() : value;
    const partition = { sourceSystemCode, productExternalId, unitCode, currencyCode, periodStartUtc, throughUtc, sourceProof, sourceRevision };
    const checksum = createHash('sha256').update(JSON.stringify({
      method: FIFO_COST_METHOD, ...partition, openingWarehouses: [...warehouses.keys()].sort(orderText), movements,
    }, toJson)).digest('hex');
    return {
      status: 'CALCULATED', ...partition, method: FIFO_COST_METHOD, checksum, valuations,
      layers: layers.map(layer => ({
        layerNo: layer.layerNo, warehouseId: layer.warehouseId, movementId: layer.movement.id,
        documentId: layer.movement.documentId, lineId: layer.movement.lineId, at: layer.movement.at,
        kind: layer.movement.kind, quantity: decimal(layer.quantity, QUANTITY_SCALE),
        remaining: decimal(layer.remaining, QUANTITY_SCALE), unitCost: decimal(layer.unitCost, COST_SCALE),
        originConsumptionNo: layer.originConsumptionNo,
      })),
      consumptions: consumptions.map(slice => ({
        consumptionNo: slice.consumptionNo, layerNo: slice.layer.layerNo, movementId: slice.movement.id,
        documentId: slice.movement.documentId, lineId: slice.movement.lineId, at: slice.movement.at,
        kind: slice.movement.kind, quantity: decimal(slice.quantity, QUANTITY_SCALE),
        returned: decimal(slice.returned, QUANTITY_SCALE), totalCost: decimal(valueOf(slice.quantity, slice.layer.unitCost, slice.movement.id), VALUE_SCALE),
      })),
    };
  } catch (error) {
    if (!(error instanceof FifoInputError)) throw error;
    return { status: 'REQUIRES_RECONCILIATION', issue: { code: error.code, movementId: error.movementId ?? null } };
  }
}
