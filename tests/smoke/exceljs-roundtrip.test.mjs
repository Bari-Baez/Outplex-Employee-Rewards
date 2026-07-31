import assert from "node:assert/strict";
import test from "node:test";
import ExcelJS from "exceljs";

test("ExcelJS writes and reads an in-memory workbook", async () => {
  const createdAt = new Date("2026-07-31T12:00:00.000Z");
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Quality Gate");
  worksheet.columns = [
    { header: "Employee", key: "employee", width: 24 },
    { header: "Points", key: "points", width: 12 },
    { header: "Created", key: "createdAt", width: 24 },
  ];
  worksheet.addRow({ employee: "Round Trip", points: 42, createdAt });
  worksheet.getCell("D2").value = { formula: "B2*2", result: 84 };

  const serialized = await workbook.xlsx.writeBuffer();
  assert.ok(serialized.byteLength > 0, "ExcelJS should produce a non-empty XLSX buffer");

  const restored = new ExcelJS.Workbook();
  await restored.xlsx.load(serialized);
  const restoredSheet = restored.getWorksheet("Quality Gate");

  assert.ok(restoredSheet, "worksheet should survive serialization");
  assert.equal(restoredSheet.getCell("A2").value, "Round Trip");
  assert.equal(restoredSheet.getCell("B2").value, 42);
  assert.equal(restoredSheet.getCell("C2").value.toISOString(), createdAt.toISOString());
  assert.deepEqual(restoredSheet.getCell("D2").value, { formula: "B2*2", result: 84 });
});
