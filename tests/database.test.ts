import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { seed } from "../lib/model";
test("Postgres migration, RLS for two users, storage boundaries and atomic saves", async () => {
  const db = new PGlite();
  const alice = "11111111-1111-4111-8111-111111111111",
    bob = "22222222-2222-4222-8222-222222222222";
  try {
    await db.exec(`create role anon; create role authenticated; create schema auth; create schema storage;
 create table auth.users(id uuid primary key);insert into auth.users values ('${alice}'),('${bob}');
 create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 grant usage on schema auth,public,storage to anon,authenticated;
 create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(id bigint generated always as identity primary key,bucket_id text,name text);
 create function storage.foldername(text) returns text[] language sql as $$select (string_to_array($1,'/'))[1:array_length(string_to_array($1,'/'),1)-1]$$;
 alter table storage.objects enable row level security;
 grant select,insert,update,delete on storage.objects to anon,authenticated;grant usage on all sequences in schema storage to anon,authenticated;
 create table public.studio_projects(user_id uuid primary key references auth.users(id),data jsonb not null default '{}',updated_at timestamptz not null default now());
 `);
    // Upgrade an actual legacy row without dropping it, then repeat migration.
    await db.query(
      "insert into public.studio_projects(user_id,data) values($1,$2)",
      [alice, JSON.stringify(seed)],
    );
    const sql = await readFile(
      new URL("../supabase/schema.sql", import.meta.url),
      "utf8",
    );
    await db.exec(sql);
    await db.exec(sql);
    await db.exec(
      await readFile(
        new URL("../supabase/hybrid-storage.sql", import.meta.url),
        "utf8",
      ),
    );
    // Deliberately add unsafe permissive policies: restrictive guards still enforce ownership.
    await db.exec(`create policy "legacy unsafe projects" on public.studio_projects for all to authenticated using(true) with check(true);
 create policy "legacy unsafe objects" on storage.objects for all to authenticated,anon using(true) with check(true);
 insert into storage.objects(bucket_id,name) values ('assets','${alice}/a.png'),('assets','${bob}/b.png');`);
    const asUser = async (id: string) =>
      db.exec(
        `reset role;set role authenticated;select set_config('request.jwt.claim.sub','${id}',false);`,
      );
    await asUser(alice);
    let rows = await db.query<{ user_id: string; version: number }>(
      "select user_id,version from public.studio_projects",
    );
    assert.equal(rows.rows.length, 1);
    assert.equal(rows.rows[0].user_id, alice);
    assert.equal(Number(rows.rows[0].version), 1);
    await assert.rejects(
      db.query(
        "insert into public.studio_projects(user_id,data) values($1,$2)",
        [bob, JSON.stringify(seed)],
      ),
      /row-level security/,
    );
    await assert.rejects(
      db.query(
        "update public.studio_projects set user_id=$1 where user_id=$2",
        [bob, alice],
      ),
      /row-level security/,
    );
    let saved = await db.query<{ version: number }>(
      "select * from public.save_studio_project($1,1)",
      [JSON.stringify(seed)],
    );
    assert.equal(Number(saved.rows[0].version), 2);
    await assert.rejects(
      db.query("select * from public.save_studio_project($1,1)", [
        JSON.stringify(seed),
      ]),
      /Project changed/,
    );
    await assert.rejects(
      db.query("select * from public.save_studio_project($1,2)", [
        JSON.stringify({ assets: [] }),
      ]),
      /Invalid project/,
    );
    const binary = structuredClone(seed);
    binary.assets[0].image = "data:image/png;base64,YWJj";
    await assert.rejects(
      db.query("select * from public.save_studio_project($1,2)", [
        JSON.stringify(binary),
      ]),
      /[Aa]bsolute path/,
    );
    binary.assets[0].image = "/Users/mac/image.png";
    await assert.rejects(
      db.query("update public.studio_projects set data=$1 where user_id=$2", [
        JSON.stringify(binary),
        alice,
      ]),
      /[Aa]bsolute path/,
    );
    const objects = await db.query<{ name: string }>(
      "select name from storage.objects",
    );
    assert.deepEqual(
      objects.rows.map((x) => x.name),
      [`${alice}/a.png`],
    );
    await assert.rejects(
      db.query("insert into storage.objects(bucket_id,name) values($1,$2)", [
        "assets",
        `${bob}/hacked.png`,
      ]),
      /row-level security/,
    );
    await asUser(bob);
    assert.equal(
      (await db.query("select * from public.studio_projects")).rows.length,
      0,
    );
    await db.query(
      "update public.studio_projects set data=$1 where user_id=$2",
      [JSON.stringify({ hacked: true }), alice],
    );
    await db.query("delete from storage.objects where name=$1", [
      `${alice}/a.png`,
    ]);
    await db.query("delete from public.studio_projects where user_id=$1", [
      alice,
    ]);
    await db.query("select * from public.save_studio_project($1,0)", [
      JSON.stringify(seed),
    ]);
    await asUser(alice);
    rows = await db.query("select user_id,version from public.studio_projects");
    assert.equal(rows.rows.length, 1);
    assert.equal(Number(rows.rows[0].version), 2);
    assert.deepEqual(
      (
        await db.query<{ data: unknown }>(
          "select data from public.studio_projects",
        )
      ).rows[0].data,
      seed,
    );
    assert.equal(
      (
        await db.query("select * from storage.objects where name=$1", [
          `${alice}/a.png`,
        ])
      ).rows.length,
      1,
    );
    await db.exec("reset role;set role anon;");
    await assert.rejects(
      db.query("select * from public.studio_projects"),
      /permission denied/,
    );
    assert.equal(
      (await db.query("select * from storage.objects where bucket_id='assets'"))
        .rows.length,
      0,
    );
    await assert.rejects(
      db.query("select * from public.save_studio_project($1,0)", [
        JSON.stringify(seed),
      ]),
      /permission denied/,
    );
  } finally {
    await db.close();
  }
});
