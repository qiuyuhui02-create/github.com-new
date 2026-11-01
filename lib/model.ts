export type Asset = {
  id: string;
  name: string;
  type: "人物" | "场景" | "道具";
  status: "待制作" | "制作中" | "已完成";
  description: string;
  model: string;
  tags: string;
  image: string;
  references: string[];
  versions: { at: string; image: string; description: string; model: string }[];
};
export type Shot = {
  id: string;
  number: string;
  title: string;
  size: string;
  duration: number;
  camera: string;
  movement: string;
  assets: string[];
};
export type Task = {
  id: string;
  title: string;
  priority: string;
  date: string;
  done: boolean;
};
export type Prompt = {
  id: string;
  title: string;
  category: string;
  content: string;
};
export type Studio = {
  assets: Asset[];
  shots: Shot[];
  tasks: Task[];
  prompts: Prompt[];
};
export const today = () =>
  new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Shanghai" }).format(
    new Date(),
  );
export const uid = () => crypto.randomUUID();
export function validateAsset(a: Pick<Asset, "name">) {
  if (!a.name.trim()) throw new Error("请输入资产名称");
}
export function analyze(s: Studio) {
  const missing = s.assets.filter((a) => a.status !== "已完成");
  const broken = s.shots.filter(
    (x) =>
      !x.assets.length ||
      x.assets.some((id) => !s.assets.find((a) => a.id === id)),
  );
  return `项目制作检查\n\n资产：${s.assets.length} 项，${missing.length} 项待完成。\n${missing.map((a) => `• ${a.name}：${a.status}${a.image ? "" : "，缺少参考图片"}`).join("\n") || "所有资产已完成。"}\n\n分镜：${s.shots.length} 个，共 ${s.shots.reduce((n, x) => n + x.duration, 0)} 秒。\n${broken.length ? broken.map((x) => `• ${x.number}：请检查关联资产`).join("\n") : "分镜资产关联完整。"}\n\n建议计划\n1. 优先补齐未完成的角色和场景。\n2. 核对镜头景别、机位与运动方式。\n3. 完成参考图审核后再进行生成。`;
}
export function shotPrompt(s: Studio) {
  return s.shots
    .map(
      (x) =>
        `${x.number} · ${x.title}\n${x.size}，${x.duration}秒，${x.camera}，${x.movement}。${x.assets
          .map((id) => s.assets.find((a) => a.id === id)?.description)
          .filter(Boolean)
          .join(
            "；",
          )}。cinematic lighting, film grain, consistent character, 2.39:1`,
    )
    .join("\n\n");
}
export const seed: Studio = {
  assets: [
    {
      id: "a1",
      name: "林 · 城市漫游者",
      type: "人物",
      status: "已完成",
      description:
        "28岁，短发，黑色风衣，独自穿行在雨夜的城市。冷静而坚定，赛博都市电影质感。",
      model: "FLUX.1 · 角色一致性",
      tags: "主角,赛博朋克,雨夜",
      image: "/art/character.svg",
      references: [],
      versions: [],
    },
    {
      id: "a2",
      name: "霓虹街区",
      type: "场景",
      status: "已完成",
      description:
        "夜雨中的未来城市，密集的霓虹灯牌，湿润路面倒映青色和琥珀色灯光。",
      model: "Midjourney v7",
      tags: "外景,夜晚,城市",
      image: "/art/city.svg",
      references: [],
      versions: [],
    },
    {
      id: "a3",
      name: "记忆存储器",
      type: "道具",
      status: "制作中",
      description: "一枚带有青色发光核心的金属记忆存储器，表面有细小磨损。",
      model: "FLUX.1",
      tags: "关键道具,科技",
      image: "/art/device.svg",
      references: [],
      versions: [],
    },
    {
      id: "a4",
      name: "废弃空间站",
      type: "场景",
      status: "制作中",
      description:
        "环形空间站内部，巨大的舷窗外是一颗寂静的行星，光束穿过灰尘。",
      model: "Midjourney v7",
      tags: "内景,太空,科幻",
      image: "/art/station.svg",
      references: [],
      versions: [],
    },
    {
      id: "a5",
      name: "陈 · 记忆修复师",
      type: "人物",
      status: "待制作",
      description:
        "年长的记忆修复师，灰白头发，佩戴精密的单目镜，居住在旧城区。",
      model: "待选择",
      tags: "配角,修复师",
      image: "/art/repair.svg",
      references: [],
      versions: [],
    },
    {
      id: "a6",
      name: "荒原信号塔",
      type: "场景",
      status: "已完成",
      description: "沙漠深处的巨型信号塔，落日下的巨大轮廓，尘埃与金色光线。",
      model: "Midjourney v7",
      tags: "外景,黄昏,荒原",
      image: "/art/desert.svg",
      references: [],
      versions: [],
    },
  ],
  shots: [
    {
      id: "s1",
      number: "SH-001",
      title: "雨夜，城市苏醒",
      size: "大全景",
      duration: 6,
      camera: "高机位",
      movement: "缓慢推进",
      assets: ["a2"],
    },
    {
      id: "s2",
      number: "SH-002",
      title: "林穿行在霓虹之间",
      size: "中景",
      duration: 4,
      camera: "平视",
      movement: "跟拍",
      assets: ["a1", "a2"],
    },
    {
      id: "s3",
      number: "SH-003",
      title: "掌心里的记忆",
      size: "特写",
      duration: 3,
      camera: "俯拍",
      movement: "固定",
      assets: ["a3"],
    },
  ],
  tasks: [
    {
      id: "t1",
      title: "完成主角三视图与服装设定",
      priority: "高",
      date: today(),
      done: false,
    },
    {
      id: "t2",
      title: "审核霓虹街区的场景光影",
      priority: "中",
      date: today(),
      done: true,
    },
    {
      id: "t3",
      title: "补齐记忆存储器细节参考图",
      priority: "高",
      date: today(),
      done: false,
    },
  ],
  prompts: [
    {
      id: "p1",
      title: "雨夜都市 · 电影场景",
      category: "场景",
      content:
        "未来都市的雨夜，潮湿街道反射霓虹灯光，体积光，青橙色调，anamorphic lens, cinematic, 35mm film, 2.39:1",
    },
    {
      id: "p2",
      title: "角色设定 · 一致性模板",
      category: "人物",
      content:
        "角色三视图，正面、侧面、背面，统一服装与面部特征，中性背景，柔和摄影棚灯光，character sheet, consistent identity",
    },
  ],
};
// Validate imported/local JSON before it reaches rendering code.
export function parseStudio(input: unknown): Studio {
  const obj = (x: unknown): x is Record<string, unknown> =>
    !!x && typeof x === "object" && !Array.isArray(x);
  const str = (x: unknown) => typeof x === "string";
  const strings = (x: unknown) => Array.isArray(x) && x.every(str);
  const arr = (x: unknown, p: (v: Record<string, unknown>) => boolean) =>
    Array.isArray(x) && x.length <= 5000 && x.every((v) => obj(v) && p(v));
  if (
    !obj(input) ||
    !arr(
      input.assets,
      (a) =>
        str(a.id) &&
        str(a.name) &&
        ["人物", "场景", "道具"].includes(String(a.type)) &&
        ["待制作", "制作中", "已完成"].includes(String(a.status)) &&
        str(a.description) &&
        str(a.model) &&
        str(a.tags) &&
        str(a.image) &&
        strings(a.references) &&
        arr(
          a.versions,
          (v) =>
            str(v.at) &&
            Number.isFinite(Date.parse(String(v.at))) &&
            str(v.image) &&
            str(v.description) &&
            str(v.model),
        ),
    ) ||
    !arr(
      input.shots,
      (s) =>
        str(s.id) &&
        str(s.number) &&
        str(s.title) &&
        str(s.size) &&
        typeof s.duration === "number" &&
        s.duration > 0 &&
        s.duration <= 600 &&
        str(s.camera) &&
        str(s.movement) &&
        strings(s.assets),
    ) ||
    !arr(
      input.tasks,
      (t) =>
        str(t.id) &&
        str(t.title) &&
        ["高", "中", "低"].includes(String(t.priority)) &&
        str(t.date) &&
        /^\d{4}-\d{2}-\d{2}$/.test(String(t.date)) &&
        typeof t.done === "boolean",
    ) ||
    !arr(
      input.prompts,
      (p) => str(p.id) && str(p.title) && str(p.category) && str(p.content),
    )
  )
    throw Error("项目数据格式不正确");
  const result = input as unknown as Studio;
  for (const list of [
    result.assets,
    result.shots,
    result.tasks,
    result.prompts,
  ])
    if (new Set(list.map((x) => x.id)).size !== list.length)
      throw Error("项目中存在重复 ID");
  return result;
}
