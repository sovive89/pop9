// @vitest-environment node
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { stockDatabase } from "./helpers/stockDatabase";

const U = "00000000-0000-0000-0000-000000000001";
const V = "00000000-0000-0000-0000-000000000002";
const A = "00000000-0000-0000-0000-000000000011";
const SOURCE = "00000000-0000-0000-0000-000000000021";
const TARGET = "00000000-0000-0000-0000-000000000022";
const LOT = "00000000-0000-0000-0000-000000000031";
const TRANSFER = "00000000-0000-0000-0000-000000000041";
let db: PGlite;

const value = async (sql: string) => Number(Object.values((await db.query<Record<string, string>>(sql)).rows[0])[0]);
const transfer = (id = TRANSFER, quantity = 30) => db.query<{ transfer_stock_lot: string }>(
  "select public.transfer_stock_lot($1,$2,$3,$4,$5) as transfer_stock_lot",
  [id, LOT, V, TARGET, quantity],
);

beforeAll(async () => { db = await stockDatabase(); }, 30000);
beforeEach(async () => {
  await db.exec("truncate stock_transfers,stock_movements,lotes,raw_materials,user_roles cascade");
  await db.query("select set_config('test.user',$1,false)", [A]);
  await db.query("insert into user_roles(user_id,role,business_unit_id) values($1,'admin',$2),($1,'admin',$3)", [A,U,V]);
  await db.query("insert into raw_materials(id,business_unit_id,name,unit,tipo) values($1,$2,'Carne','g','insumo'),($3,$4,'carne','g','insumo')", [SOURCE,U,TARGET,V]);
  await db.query(`insert into lotes(id,business_unit_id,raw_material_id,numero_lote,origem,quantidade_entrada,validade,preco_unitario,custo_total)
    values($1,$2,$3,'LOTE-A','compra',100,'2027-12-31',0.25,25)`, [LOT,U,SOURCE]);
  await db.query(`insert into stock_movements(raw_material_id,business_unit_id,type,quantity,reason,lote_id,unit_cost,created_by)
    values($1,$2,'entrada',100,'compra',$3,0.25,$4)`, [SOURCE,U,LOT,A]);
});
afterAll(async () => { await db?.close(); });

describe("transferência parcial de lote entre unidades", () => {
  it("baixa a origem e cria lote pareado no destino preservando quantidade, validade e custo", async () => {
    const result = await transfer();
    const targetLotId = result.rows[0].transfer_stock_lot;
    expect(await value(`select quantidade_restante from stock_lot_balances where id='${LOT}'`)).toBe(70);
    expect(await value(`select quantidade_restante from stock_lot_balances where id=(select id from lotes where transfer_id='${TRANSFER}')`)).toBe(30);
    expect(await value(`select current_stock from raw_materials where id='${SOURCE}'`)).toBe(70);
    expect(await value(`select current_stock from raw_materials where id='${TARGET}'`)).toBe(30);
    expect((await db.query<{ validade: Date; preco_unitario: string; origem: string; source_lote_id: string }>(
      "select validade,preco_unitario,origem,source_lote_id from lotes where id=$1", [targetLotId],
    )).rows[0]).toMatchObject({ validade: new Date("2027-12-31T00:00:00.000Z"), preco_unitario: "0.25", origem: "transferencia", source_lote_id: LOT });
    expect(await value(`select count(*) from stock_movements where reference_type='stock_transfer' and reference_id='${TRANSFER}'`)).toBe(2);
  });

  it("é idempotente em retry e não duplica lotes nem movimentos", async () => {
    const first = (await transfer()).rows[0].transfer_stock_lot;
    const retry = (await transfer()).rows[0].transfer_stock_lot;
    expect(retry).toBe(first);
    expect(await value(`select count(*) from stock_transfers where id='${TRANSFER}'`)).toBe(1);
    expect(await value(`select count(*) from stock_movements where reference_type='stock_transfer' and reference_id='${TRANSFER}'`)).toBe(2);
    expect(await value(`select current_stock from raw_materials where id='${SOURCE}'`)).toBe(70);
  });

  it("rejeita saldo insuficiente sem registrar metade da operação", async () => {
    await expect(transfer(TRANSFER,101)).rejects.toThrow("Quantidade excede o saldo disponível");
    expect(await value("select count(*) from stock_transfers")).toBe(0);
    expect(await value("select count(*) from lotes where origem='transferencia'")).toBe(0);
    expect(await value(`select current_stock from raw_materials where id='${SOURCE}'`)).toBe(100);
    expect(await value(`select current_stock from raw_materials where id='${TARGET}'`)).toBe(0);
  });

  it("rejeita unidade-base/nome incompatível e exige admin nas duas unidades", async () => {
    await db.query("update raw_materials set name='Outro insumo' where id=$1", [TARGET]);
    await expect(transfer()).rejects.toThrow("insumo correspondente");
    await db.query("update raw_materials set name='carne' where id=$1", [TARGET]);
    await db.query("update raw_materials set unit='kg' where id=$1", [TARGET]);
    await expect(transfer()).rejects.toThrow("insumo correspondente");
    await db.query("update raw_materials set unit='g' where id=$1", [TARGET]);
    await db.query("delete from user_roles where user_id=$1 and business_unit_id=$2", [A,V]);
    await expect(transfer()).rejects.toThrow("admin nas unidades de origem e destino");
    expect(await value("select count(*) from stock_transfers")).toBe(0);
  });
});
