import { zipSync, strToU8 } from "fflate";
import { parseStudio, type Studio } from "./model";
import { describeFile, bindMedia } from "./media";
export async function migrateLegacy(
  input: Studio,
  readStorage?: (src: string) => Promise<Blob>,
) {
  const data = structuredClone(parseStudio(input));
  const entries: Record<string, Uint8Array> = {};
  const issues: string[] = [];
  const cache = new Map<string, string>();
  let total = 0;
  async function convert(src: string, assetId?: string): Promise<string> {
    if (!src || src.startsWith("local:") || src.startsWith("/art/")) return src;
    if (cache.has(src)) return cache.get(src)!;
    try {
      let blob: Blob;
      if (/^data:image\/(png|jpeg|webp);base64,/.test(src))
        blob = await (await fetch(src)).blob();
      else if (src.startsWith("storage:") && readStorage)
        blob = await readStorage(src);
      else throw Error("需要手动重新定位");
      if (
        !["image/png", "image/jpeg", "image/webp"].includes(blob.type) ||
        blob.size > 5 * 1024 * 1024
      )
        throw Error("只迁移 5MB 内旧图片，大文件请手动复制");
      total += blob.size;
      if (total > 50 * 1024 * 1024) throw Error("迁移包超过 50MB，请分批处理");
      const file = new File(
        [blob],
        `legacy-${crypto.randomUUID()}.${blob.type.split("/")[1]}`,
        { type: blob.type },
      );
      const media = await describeFile(file, "参考图", { assetId });
      data.files = [...(data.files || []), media];
      entries[media.relativePath] = new Uint8Array(await blob.arrayBuffer());
      bindMedia(media.id, file);
      const ref = `local:${media.id}`;
      cache.set(src, ref);
      return ref;
    } catch (e) {
      issues.push(`${assetId || "素材"}：${(e as Error).message}`);
      return src;
    }
  }
  for (const a of data.assets) {
    a.image = await convert(a.image, a.id);
    for (let i = 0; i < a.references.length; i++)
      a.references[i] = await convert(a.references[i], a.id);
    for (const v of a.versions) v.image = await convert(v.image, a.id);
  }
  for (const shot of data.shots)
    if (shot.image) shot.image = await convert(shot.image);
  entries["backups/project.json"] = strToU8(JSON.stringify(data, null, 2));
  entries["backups/migration-report.txt"] = strToU8(
    issues.length
      ? issues.join("\n")
      : "旧图片提取完成。解压到新的空目录，重新选择该目录并核验后，再推送轻量元数据。原云端素材未删除。",
  );
  return { data, issues, zip: zipSync(entries, { level: 0 }) };
}
