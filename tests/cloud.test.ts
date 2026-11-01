import { test } from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cacheKey, cloudError, saveCloud, loadCloud } from "../lib/cloud";
import { seed } from "../lib/model";
test("local account caches do not share data with demo or other users", () => {
  assert.equal(cacheKey(null), "framework-studio-v1");
  assert.notEqual(cacheKey("alice"), cacheKey("bob"));
  assert.notEqual(cacheKey("alice"), cacheKey(null));
});
test("save preserves all modules and sends expected version for atomic conflict protection", async () => {
  const client = {
    rpc: async (name: string, args: Record<string, unknown>) => {
      assert.equal(name, "save_studio_project");
      assert.deepEqual(args.project_data, seed);
      assert.equal(args.expected_version, 3);
      return { data: [{ version: 4, updated_at: "now" }], error: null };
    },
  } as unknown as SupabaseClient;
  assert.deepEqual(await saveCloud(client, seed, 3), { version: 4, at: "now" });
  const conflict = {
    rpc: async () => ({ error: { code: "40001" } }),
  } as unknown as SupabaseClient;
  await assert.rejects(saveCloud(conflict, seed, 3), /云端项目已更新/);
});
test("cloud read scopes by user and validates project format", async () => {
  const client = {
    from: (table: string) => {
      assert.equal(table, "studio_projects");
      return {
        select: () => ({
          eq: (field: string, id: string) => {
            assert.equal(field, "user_id");
            assert.equal(id, "alice");
            return {
              maybeSingle: async () => ({
                data: { data: seed, version: 2, updated_at: "now" },
                error: null,
              }),
            };
          },
        }),
      };
    },
  } as unknown as SupabaseClient;
  assert.deepEqual((await loadCloud(client, "alice"))?.data, seed);
  assert.match(cloudError({ code: "PGRST202" }).message, /schema.sql/);
});
