import assert from 'node:assert/strict';
import test from 'node:test';
import { 
  calculateSalaryTaxRials, 
  generatePayaBankingBatchFile, 
  parseBiometricAttendanceLogs 
} from '../src/services/payrollEngine.ts';
import { 
  calculateHaversineDistanceKm, 
  optimizeRouteStops 
} from '../src/lib/geoRoutingEngine.ts';

test('Tax Calculations - Article 84 progressive brackets verification', () => {
  // حقوق زیر سقف معافیت (14 میلیون تومان = 140,000,000 ریال) -> صفر ریال مالیات
  assert.equal(calculateSalaryTaxRials(120_000_000), 0);
  assert.equal(calculateSalaryTaxRials(140_000_000), 0);

  // حقوق 18 میلیون تومان -> 4 میلیون مشمول پله اول 10% = 400 هزار تومان (4,000,000 ریال)
  assert.equal(calculateSalaryTaxRials(180_000_000), 4_000_000);

  // حقوق 25 میلیون تومان -> (5.5M * 10%) + (5.5M * 15%) = 550,000 + 825,000 = 1,375,000 تومان (13,750,000 ریال)
  assert.equal(calculateSalaryTaxRials(250_000_000), 13_750_000);
});

test('Paya Banking Batch Generator - Generates standard CSV file for bank upload', () => {
  const dummyPayslips = [
    { id: 'ps-1', userId: 'u1', month: '1405-01', netPayableRials: 180_000_000, lines: [] },
    { id: 'ps-2', userId: 'u2', month: '1405-01', netPayableRials: 240_000_000, lines: [] }
  ];
  const dummyUsers = [
    { id: 'u1', name: 'علی حسینی', username: 'a.hosseini', nationalId: '0499370899' },
    { id: 'u2', name: 'سارا رضایی', username: 's.rezaei', nationalId: '0499370888' }
  ];

  const payaFile = generatePayaBankingBatchFile(dummyPayslips, dummyUsers);
  assert.equal(payaFile.totalRecords, 2);
  assert.equal(payaFile.totalAmountRials, 420_000_000);
  assert.ok(payaFile.fileContent.includes('علی حسینی'));
  assert.ok(payaFile.fileContent.includes('180000000'));
  assert.ok(payaFile.fileContent.startsWith('\uFEFF')); // BOM for Excel Persian encoding
});

test('Geo Routing - Haversine distance and nearest neighbor sequencing', () => {
  // فاصله دو نقطه معروف در تهران (میدان آزادی به میدان فاطمی حدود 7.5 تا 8 کیلومتر)
  const azadi = { longitude: 51.3380, latitude: 35.6997 };
  const fatemi = { longitude: 51.4055, latitude: 35.7190 };
  const d = calculateHaversineDistanceKm(azadi, fatemi);

  assert.ok(d > 5 && d < 10, `Expected distance between 5 and 10 km, got ${d}`);

  const stops = [
    { id: 's1', name: 'فروشگاه دور', point: { longitude: 51.50, latitude: 35.75 } },
    { id: 's2', name: 'فروشگاه نزدیک', point: { longitude: 51.35, latitude: 35.70 } }
  ];

  const route = optimizeRouteStops(azadi, stops);
  assert.equal(route.orderedStops[0].id, 's2'); // اول باید به فروشگاه نزدیک‌تر برود
  assert.ok(route.totalDistanceKm > 0);
  assert.ok(route.estimatedDriveMinutes > 0);
});
