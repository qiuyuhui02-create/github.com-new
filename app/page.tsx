"use client";
import { useEffect, useState, useRef } from "react";
import {
  Aperture,
  ArrowDownToLine,
  ArrowUpRight,
  AudioLines,
  Box,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronRight,
  Clapperboard,
  Cloud,
  Copy,
  Film,
  Folder,
  Grid2X2,
  ImagePlus,
  LayoutGrid,
  List,
  LoaderCircle,
  Plus,
  Search,
  Settings2,
  SlidersHorizontal,
  Sparkles,
  Star,
  Trash2,
  Upload,
  Users,
  X,
} from "lucide-react";
import {
  analyze,
  Asset,
  Prompt,
  seed,
  Shot,
  shotPrompt,
  Studio,
  today,
  uid,
  validateAsset,
  parseStudio,
} from "@/lib/model";
import { supabase } from "@/lib/supabase";
import {
  cacheKey,
  emptyStudio,
  loadCloud,
  saveCloud,
  migrateImages,
  verifiedClient,
} from "@/lib/cloud";
const modules = [
  { name: "今日计划", icon: CalendarDays },
  { name: "资产制作", icon: Box },
  { name: "资产总览", icon: LayoutGrid },
  { name: "分镜制作", icon: Clapperboard },
  { name: "分镜总览", icon: Film },
  { name: "Prompt 中心", icon: AudioLines },
  { name: "AI Agent", icon: Sparkles },
];
const emptyAsset = (): Asset => ({
  id: uid(),
  name: "",
  type: "人物",
  status: "待制作",
  description: "",
  model: "",
  tags: "",
  image: "",
  references: [],
  versions: [],
});
export default function StudioPage() {
  const [data, setData] = useState<Studio>(seed),
    [ready, setReady] = useState(false),
    [page, setPage] = useState("资产总览"),
    [search, setSearch] = useState(""),
    [category, setCategory] = useState("全部资产"),
    [status, setStatus] = useState("全部状态"),
    [view, setView] = useState("grid"),
    [notice, setNotice] = useState(""),
    [asset, setAsset] = useState<Asset | null>(null),
    [shot, setShot] = useState<Shot | null>(null),
    [prompt, setPrompt] = useState<Prompt | null>(null),
    [settings, setSettings] = useState(false),
    [email, setEmail] = useState(""),
    [otp, setOtp] = useState(""),
    [user, setUser] = useState(""),
    [busy, setBusy] = useState(false),
    [report, setReport] = useState(""),
    [question, setQuestion] = useState(
      "请检查项目缺失的资产，并给出下一步制作计划。",
    ),
    [taskTitle, setTaskTitle] = useState(""),
    [priority, setPriority] = useState("高"),
    [taskDate, setTaskDate] = useState(today()),
    [cloudAt, setCloudAt] = useState("");
  const [userId, setUserId] = useState<string | null>(null);
  const [cloudVersion, setCloudVersion] = useState(0);
  const [cloudVerified, setCloudVerified] = useState(false);
  const activeUser = useRef<string | null>(null);
  const accountEpoch = useRef(0);
  const tell = (s: string) => setNotice(s);
  useEffect(() => {
    function selectAccount(id: string | null, email: string) {
      if (activeUser.current === id && initialized) return;
      initialized = true;
      accountEpoch.current++;
      activeUser.current = id;
      setReady(false);
      setUserId(id);
      setUser(email);
      setCloudAt("");
      setCloudVerified(false);
      setAsset(null);
      setShot(null);
      setPrompt(null);
      setReport("");
      let next = id ? emptyStudio() : structuredClone(seed),
        version = 0;
      try {
        const raw = localStorage.getItem(cacheKey(id));
        if (raw) {
          const parsed = JSON.parse(raw);
          next = parseStudio(id ? parsed.data : parsed);
          version =
            id && Number.isSafeInteger(parsed.version) ? parsed.version : 0;
        }
      } catch {
        setNotice("本地缓存无法读取，请导入备份或从云端载入。");
      }
      setData(next);
      setCloudVersion(version);
      setReady(true);
    }
    let initialized = false;
    selectAccount(null, "");
    if (new URLSearchParams(location.search).has("auth_error"))
      setNotice("登录链接已过期或无法验证，请重新发送登录邮件。");
    // Supabase emits INITIAL_SESSION. Do not run async Supabase calls inside this callback.
    const sub = supabase?.auth.onAuthStateChange((_event, session) =>
      selectAccount(session?.user.id || null, session?.user.email || ""),
    );
    return () => sub?.data.subscription.unsubscribe();
  }, []);
  useEffect(() => {
    if (!ready) return;
    try {
      localStorage.setItem(
        cacheKey(userId),
        JSON.stringify(userId ? { data, version: cloudVersion } : data),
      );
    } catch {
      setNotice("本地空间不足，本次更改未保存。请导出项目并压缩图片。");
    }
  }, [data, ready, userId, cloudVersion]);
  useEffect(() => {
    if (notice) {
      const t = setTimeout(() => setNotice(""), 6000);
      return () => clearTimeout(t);
    }
  }, [notice]);
  const update = (next: Partial<Studio>) => {
    setData((d) => ({ ...d, ...next }));
    setCloudAt("");
  };
  const filtered = data.assets.filter(
    (a) =>
      (category === "全部资产" || a.type === category) &&
      (status === "全部状态" || a.status === status) &&
      `${a.name} ${a.description} ${a.tags}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  function saveAsset() {
    if (!asset) return;
    try {
      validateAsset(asset);
      const old = data.assets.find((a) => a.id === asset.id);
      const saved = {
        ...asset,
        name: asset.name.trim(),
        versions: old
          ? [
              {
                at: new Date().toISOString(),
                image: old.image,
                description: old.description,
                model: old.model,
              },
              ...old.versions,
            ].slice(0, 20)
          : asset.versions,
      };
      update({
        assets: old
          ? data.assets.map((a) => (a.id === asset.id ? saved : a))
          : [saved, ...data.assets],
      });
      setAsset(null);
      tell("资产已保存到本地");
    } catch (e) {
      tell((e as Error).message);
    }
  }
  async function upload(file: File | undefined, reference = false) {
    if (!file || !asset) return;
    if (
      !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
      file.size > 5 * 1024 * 1024
    )
      return tell("请上传 5MB 以内的 JPG、PNG 或 WebP 图片");
    const epoch = accountEpoch.current;
    setBusy(true);
    try {
      let image = "";
      if (supabase && user) {
        const db = await verifiedClient(supabase, userId!);
        const path = `${userId}/${uid()}.${file.type.split("/")[1]}`;
        const { error } = await db.storage.from("assets").upload(path, file);
        if (error) throw error;
        image = `storage:${path}`;
      } else {
        image = await new Promise<string>((resolve, reject) => {
          const r = new FileReader();
          r.onload = () => resolve(String(r.result));
          r.onerror = reject;
          r.readAsDataURL(file);
        });
      }
      if (accountEpoch.current !== epoch) return;
      setAsset((a) =>
        a
          ? {
              ...a,
              ...(reference
                ? { references: [...a.references, image] }
                : { image }),
            }
          : a,
      );
      tell(
        user
          ? "图片已上传，请保存资产并推送项目"
          : "图片已载入，请保存资产；演示图片仅保存在此浏览器",
      );
    } catch (e) {
      tell(`上传失败：${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }
  async function sync(direction: "push" | "pull", imported?: Studio) {
    if (!supabase || !userId) return tell("请先配置 Supabase 并登录");
    if (
      !confirm(
        direction === "push"
          ? imported
            ? "将备份中的四类数据导入当前账号云端项目，替换云端内容；本地图片将上传。是否继续？"
            : "将当前项目保存到云端？若其他页面已更新项目，本次保存会被拒绝。"
          : "用云端项目替换当前本地项目？建议先导出本地备份。",
      )
    )
      return;
    const epoch = accountEpoch.current,
      owner = userId;
    setBusy(true);
    try {
      const db = await verifiedClient(supabase, owner);
      if (direction === "push") {
        const migrated = await migrateImages(db, imported || data, owner);
        if (accountEpoch.current !== epoch) return;
        const result = await saveCloud(db, migrated, cloudVersion);
        if (accountEpoch.current !== epoch) return;
        setData(migrated);
        setCloudVersion(result.version);
        setCloudAt(result.at);
      } else {
        const result = await loadCloud(db, owner);
        if (accountEpoch.current !== epoch) return;
        setData(result?.data || emptyStudio());
        setCloudVersion(result?.version || 0);
        setCloudAt(result?.at || "");
        if (result) tell("云端项目已载入");
        if (!result)
          tell("云端连接成功，当前账号暂无项目。可导入 JSON 备份或新建资产。");
      }
      setCloudVerified(true);
      if (direction === "push") tell("资产、分镜、任务和 Prompt 已保存到云端");
    } catch (e) {
      if (accountEpoch.current === epoch) tell((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function login(verify = false) {
    if (!supabase) return tell("未配置 Supabase，请查看 README");
    setBusy(true);
    try {
      const { error } = verify
        ? await supabase.auth.verifyOtp({ email, token: otp, type: "email" })
        : await supabase.auth.signInWithOtp({
            email,
            options: { emailRedirectTo: `${location.origin}/auth/callback` },
          });
      if (error) throw error;
      tell(
        verify
          ? "登录成功"
          : "登录邮件已发送，请点击邮件中的链接，或输入验证码",
      );
    } catch (e) {
      tell((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function exportData() {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "framework-studio.json";
    a.click();
    URL.revokeObjectURL(url);
    tell("项目备份已导出");
  }
  async function paidAI() {
    if (!supabase || !user) return tell("云端 AI 需要先配置 Supabase 并登录");
    if (
      !confirm(
        "将调用 OpenAI，可能产生费用。已推送的云端项目数据会发送给 OpenAI。是否继续？",
      )
    )
      return;
    const epoch = accountEpoch.current;
    setBusy(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const r = await fetch("/api/agent", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ question }),
      });
      const json = await r.json();
      if (!r.ok) throw Error(json.error);
      if (accountEpoch.current === epoch) setReport(json.text);
    } catch (e) {
      tell((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const removeAsset = () => {
    if (!asset || !confirm("删除此资产？分镜中的关联也会移除。")) return;
    update({
      assets: data.assets.filter((a) => a.id !== asset.id),
      shots: data.shots.map((s) => ({
        ...s,
        assets: s.assets.filter((id) => id !== asset.id),
      })),
    });
    setAsset(null);
    tell("资产已删除");
  };
  const newShot = () =>
    setShot({
      id: uid(),
      number: `SH-${String(data.shots.length + 1).padStart(3, "0")}`,
      title: "",
      size: "中景",
      duration: 4,
      camera: "平视",
      movement: "固定",
      assets: [],
    });
  return (
    <>
      <div className="studio-shell" inert={busy}>
        <aside className="sidebar">
          <a className="brand" href="/" aria-label="FRAMEWORK Studio 首页">
            <span className="brand-icon">
              <Aperture size={26} />
            </span>
            <span>
              FRAMEWORK<small>STUDIO / 创作无界</small>
            </span>
          </a>
          <div className="workspace-label">
            工作空间 <span>⌘ K</span>
          </div>
          <button className="project-switch" onClick={() => setSettings(true)}>
            <span className="project-icon">
              <Film size={19} />
            </span>
            <span>
              最后的记忆<small>科幻短片 · 示例项目</small>
            </span>
            <ChevronDown size={15} />
          </button>
          <div className="nav-label">制作工作台</div>
          <nav>
            {modules.map((m, i) => (
              <button
                key={m.name}
                aria-label={m.name}
                title={m.name}
                className={`nav-item ${page === m.name ? "active" : ""}`}
                onClick={() => {
                  setPage(m.name);
                  setSearch("");
                }}
              >
                <m.icon size={18} />
                <span>{m.name}</span>
                {i === 2 ? (
                  <span className="nav-count">{data.assets.length}</span>
                ) : i === 6 ? (
                  <span className="ai-dot" />
                ) : null}
              </button>
            ))}
          </nav>
          <div className="sidebar-bottom">
            <div className="agent-card">
              <span className="tiny-icon">
                <Sparkles size={17} />
              </span>
              <strong>让灵感，更进一步</strong>
              <p>把繁琐留给 AI，专注你的创作。</p>
              <button onClick={() => setPage("AI Agent")}>
                打开 AI Agent <ArrowUpRight size={14} />
              </button>
            </div>
            <button className="nav-item" onClick={() => setSettings(true)}>
              <Settings2 size={17} />
              项目与云端设置
            </button>
            <div className="profile">
              <span>F</span>
              <div>
                独立创作者<small>{user || "本地演示工作空间"}</small>
              </div>
              <span className="online" />
            </div>
          </div>
        </aside>
        <main>
          <header className="topbar">
            <div>
              <span className="muted">工作空间</span>
              <ChevronRight size={13} />
              <span>最后的记忆</span>
              <span className="header-divider" />
              <span className="project-chip">短片项目</span>
            </div>
            <div>
              <span className="save-state">
                <i />
                {ready ? "本地自动保存" : "正在载入"}
              </span>
              <button
                className="icon-button"
                aria-label="云端设置"
                onClick={() => setSettings(true)}
              >
                <Cloud size={18} />
              </button>
              <span className="avatar">FW</span>
            </div>
          </header>
          <div className="content">
            <div className="breadcrumb">
              项目工作台 <span>/</span> {page}
            </div>
            <section className="page-heading">
              <div>
                <div className="eyebrow">YOUR CREATIVE UNIVERSE</div>
                <h1>
                  {page}
                  <span className="heading-dot">.</span>
                </h1>
                <p>
                  {page.startsWith("资产")
                    ? "让每个角色、每处场景、每件道具，都成为故事的一部分。"
                    : page.startsWith("分镜")
                      ? "把故事拆解为镜头，让每一帧都有意义。"
                      : page === "今日计划"
                        ? "从今天的一小步，到银幕上的无限可能。"
                        : page === "AI Agent"
                          ? "你的制作搭档，随时准备好连接创意与执行。"
                          : "收集灵感，沉淀每一次有效的表达。"}
                </p>
              </div>
              <div className="heading-actions">
                <button className="secondary" onClick={exportData}>
                  <ArrowDownToLine size={15} />
                  导出项目
                </button>
                <button
                  className="primary"
                  onClick={() =>
                    page.startsWith("资产")
                      ? setAsset(emptyAsset())
                      : page.startsWith("分镜")
                        ? newShot()
                        : page === "Prompt 中心"
                          ? setPrompt({
                              id: uid(),
                              title: "",
                              category: "人物",
                              content: "",
                            })
                          : page === "AI Agent"
                            ? setReport(analyze(data))
                            : document.getElementById("task-title")?.focus()
                  }
                >
                  <Plus size={16} />
                  {page.startsWith("资产")
                    ? "新建资产"
                    : page.startsWith("分镜")
                      ? "新建分镜"
                      : page === "Prompt 中心"
                        ? "新建 Prompt"
                        : page === "AI Agent"
                          ? "检查项目"
                          : "添加任务"}
                </button>
              </div>
            </section>
            <div className="demo-banner">
              <span>
                <span className="demo-pill">DEMO</span>
                {user
                  ? `已登录 · ${cloudVerified ? "云端读写已验证" : "云端尚未验证"} · 更改先保存在本地，请手动推送。`
                  : "演示模式 · 使用示例项目，数据仅保存在当前浏览器。Supabase 与 OpenAI 尚未连接。"}
              </span>
              <button onClick={() => setSettings(true)}>
                配置云端 <ArrowUpRight size={13} />
              </button>
            </div>
            {page.startsWith("资产") && (
              <>
                <section className="stats">
                  {[
                    {
                      label: "全部资产",
                      value: data.assets.length,
                      icon: Box,
                      caption: "构建你的故事世界",
                      type: "全部资产",
                    },
                    {
                      label: "人物角色",
                      value: data.assets.filter((a) => a.type === "人物")
                        .length,
                      icon: Users,
                      caption: "每个角色，都有故事",
                      type: "人物",
                    },
                    {
                      label: "场景空间",
                      value: data.assets.filter((a) => a.type === "场景")
                        .length,
                      icon: Film,
                      caption: "让想象有处可栖",
                      type: "场景",
                    },
                    {
                      label: "道具物件",
                      value: data.assets.filter((a) => a.type === "道具")
                        .length,
                      icon: Box,
                      caption: "细节，让世界真实",
                      type: "道具",
                    },
                  ].map((s, i) => (
                    <button
                      className={`stat-card ${i === 0 ? "stat-featured" : ""}`}
                      key={s.label}
                      onClick={() => setCategory(s.type)}
                    >
                      <div>
                        <span>{s.label}</span>
                        <s.icon size={19} />
                      </div>
                      <strong>
                        {String(s.value).padStart(2, "0")}
                        <span>
                          {i === 0
                            ? "ASSETS"
                            : i === 1
                              ? "CHARACTERS"
                              : i === 2
                                ? "ENVIRONMENTS"
                                : "PROPS"}
                        </span>
                      </strong>
                      <small>{s.caption}</small>
                    </button>
                  ))}
                </section>
                <div className="collection-bar">
                  <div className="tabs">
                    {["全部资产", "人物", "场景", "道具"].map((c) => (
                      <button
                        className={category === c ? "selected" : ""}
                        key={c}
                        onClick={() => setCategory(c)}
                      >
                        {c}
                        <span>
                          {c === "全部资产"
                            ? data.assets.length
                            : data.assets.filter((a) => a.type === c).length}
                        </span>
                      </button>
                    ))}
                  </div>
                  <div className="view-buttons">
                    <button
                      className={view === "grid" ? "selected" : ""}
                      aria-label="卡片视图"
                      onClick={() => setView("grid")}
                    >
                      <Grid2X2 size={16} />
                    </button>
                    <button
                      className={view === "list" ? "selected" : ""}
                      aria-label="列表视图"
                      onClick={() => setView("list")}
                    >
                      <List size={17} />
                    </button>
                  </div>
                </div>
                <div className="filterbar">
                  <label className="search">
                    <Search size={16} />
                    <input
                      placeholder="搜索资产名称、描述或标签…"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                    <span>⌕</span>
                  </label>
                  <select
                    aria-label="按状态筛选"
                    value={status}
                    onChange={(e) => setStatus(e.target.value)}
                  >
                    {["全部状态", "待制作", "制作中", "已完成"].map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                  <span className="filter-info">
                    <SlidersHorizontal size={14} />共 {filtered.length} 项资产
                  </span>
                </div>
                {page === "资产制作" && (
                  <div className="production-tip">
                    <ImagePlus size={20} />
                    <div>
                      <strong>从一张参考图，开始构建世界</strong>
                      <p>
                        点击资产编辑设定、上传参考图、记录生成模型与历史版本。
                      </p>
                    </div>
                    <button
                      className="secondary"
                      onClick={() => setAsset(emptyAsset())}
                    >
                      创建第一版 <ArrowUpRight size={14} />
                    </button>
                  </div>
                )}
                <div
                  className={`asset-grid ${view === "list" ? "asset-list" : ""}`}
                >
                  {filtered.map((a) => (
                    <button
                      className="asset-card"
                      key={a.id}
                      onClick={() => setAsset(structuredClone(a))}
                    >
                      <div className="asset-image">
                        <AssetImage src={a.image} alt={a.name} />
                        <span className="type-pill">
                          {a.type === "人物" ? (
                            <Users size={11} />
                          ) : a.type === "场景" ? (
                            <Film size={11} />
                          ) : (
                            <Box size={11} />
                          )}{" "}
                          {a.type}
                        </span>
                        <span className="card-open">
                          <ArrowUpRight size={15} />
                        </span>
                        <div className="image-shade" />
                        <span className="image-code">
                          FW / {a.id.slice(0, 6).toUpperCase()}
                        </span>
                      </div>
                      <div className="asset-info">
                        <div className="asset-title">
                          <h3>{a.name}</h3>
                          <span className={`status status-${a.status}`}>
                            <i />
                            {a.status}
                          </span>
                        </div>
                        <p>{a.description}</p>
                        <div className="asset-meta">
                          <span>
                            {a.tags
                              .split(/[,，]/)
                              .slice(0, 2)
                              .map((t) => (
                                <em key={t}>{t}</em>
                              ))}
                          </span>
                          <span>
                            v{a.versions.length + 1}.0{" "}
                            <ChevronRight size={12} />
                          </span>
                        </div>
                      </div>
                    </button>
                  ))}
                  <button
                    className="add-asset"
                    onClick={() => setAsset(emptyAsset())}
                  >
                    <span>
                      <Plus size={25} />
                    </span>
                    <strong>构建下一个灵感</strong>
                    <p>创建人物、场景或道具资产</p>
                    <small>
                      新建资产 <ArrowUpRight size={12} />
                    </small>
                  </button>
                </div>
                {filtered.length === 0 && (
                  <p className="empty">没有匹配的资产，试试其他关键词。</p>
                )}
              </>
            )}
            {page === "今日计划" && (
              <>
                <div className="section-intro">
                  <h2>制作日程</h2>
                  <span>
                    {data.tasks.filter((t) => t.done).length} /{" "}
                    {data.tasks.length} 已完成
                  </span>
                </div>
                <div className="progress">
                  <span
                    style={{
                      width: `${data.tasks.length ? (data.tasks.filter((t) => t.done).length / data.tasks.length) * 100 : 0}%`,
                    }}
                  />
                </div>
                <form
                  className="task-form panel"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!taskTitle.trim()) return;
                    update({
                      tasks: [
                        ...data.tasks,
                        {
                          id: uid(),
                          title: taskTitle.trim(),
                          priority,
                          date: taskDate,
                          done: false,
                        },
                      ],
                    });
                    setTaskTitle("");
                  }}
                >
                  <input
                    id="task-title"
                    required
                    placeholder="今天想完成什么？"
                    value={taskTitle}
                    onChange={(e) => setTaskTitle(e.target.value)}
                  />
                  <input
                    type="date"
                    required
                    aria-label="任务日期"
                    value={taskDate}
                    onChange={(e) => setTaskDate(e.target.value)}
                  />
                  <select
                    aria-label="优先级"
                    value={priority}
                    onChange={(e) => setPriority(e.target.value)}
                  >
                    {["高", "中", "低"].map((p) => (
                      <option key={p}>{p}</option>
                    ))}
                  </select>
                  <button className="primary">添加任务</button>
                </form>
                <div className="task-list">
                  {[...data.tasks]
                    .sort(
                      (a, b) =>
                        a.date.localeCompare(b.date) ||
                        ["高", "中", "低"].indexOf(a.priority) -
                          ["高", "中", "低"].indexOf(b.priority),
                    )
                    .map((t) => (
                      <div
                        className={`task-row ${t.done ? "done" : ""}`}
                        key={t.id}
                      >
                        <input
                          type="checkbox"
                          aria-label={`完成 ${t.title}`}
                          checked={t.done}
                          onChange={() =>
                            update({
                              tasks: data.tasks.map((x) =>
                                x.id === t.id ? { ...x, done: !x.done } : x,
                              ),
                            })
                          }
                        />
                        <span>{t.title}</span>
                        <em
                          className={t.priority === "高" ? "priority-high" : ""}
                        >
                          {t.priority}优先级
                        </em>
                        <time>{t.date}</time>
                        <button
                          className="icon-button"
                          aria-label="删除任务"
                          onClick={() =>
                            update({
                              tasks: data.tasks.filter((x) => x.id !== t.id),
                            })
                          }
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    ))}
                </div>
              </>
            )}
            {page.startsWith("分镜") && (
              <>
                <div className="section-intro">
                  <h2>
                    {page === "分镜总览"
                      ? "故事板 / STORYBOARD"
                      : "镜头列表 / SHOT LIST"}
                  </h2>
                  <span>
                    {data.shots.length} 个镜头 · 总时长{" "}
                    {data.shots.reduce((n, x) => n + x.duration, 0)}s
                  </span>
                </div>
                <div
                  className={page === "分镜总览" ? "shot-grid" : "shot-list"}
                >
                  {data.shots.map((s, i) => (
                    <article className="shot-card panel" key={s.id}>
                      <button
                        className="shot-visual"
                        onClick={() => setShot(structuredClone(s))}
                      >
                        <AssetImage
                          src={
                            data.assets.find((a) => a.id === s.assets[0])
                              ?.image || ""
                          }
                          alt={s.title}
                        />
                        <span>{s.number}</span>
                        <b>{s.duration}s</b>
                      </button>
                      <div className="shot-content">
                        <span className="eyebrow">
                          SEQUENCE {String(i + 1).padStart(2, "0")}
                        </span>
                        <h3>{s.title}</h3>
                        <p>
                          {s.size} / {s.camera} / {s.movement}
                        </p>
                        <div className="shot-links">
                          {s.assets.map((id) => (
                            <span key={id}>
                              {data.assets.find((a) => a.id === id)?.name ||
                                "资产缺失"}
                            </span>
                          ))}
                        </div>
                        <div className="shot-actions">
                          <button
                            className="text-button"
                            onClick={() => setShot(structuredClone(s))}
                          >
                            编辑镜头 <ArrowUpRight size={13} />
                          </button>
                          <button
                            className="text-button"
                            disabled={i === 0}
                            onClick={() => {
                              const a = [...data.shots];
                              [a[i], a[i - 1]] = [a[i - 1], a[i]];
                              update({ shots: a });
                            }}
                          >
                            前移
                          </button>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
                {data.shots.length === 0 && (
                  <p className="empty">还没有分镜，点击“新建分镜”开始。</p>
                )}
                <div className="timeline panel">
                  <div className="section-intro">
                    <h3>时间线</h3>
                    <span>点击片段编辑 · 单位 / 秒</span>
                  </div>
                  <div className="timeline-ruler">
                    <span>00:00</span>
                    <span>
                      {data.shots.reduce((n, s) => n + s.duration, 0)}s
                    </span>
                  </div>
                  <div className="timeline-track">
                    {data.shots.map((s) => (
                      <button
                        key={s.id}
                        style={{ flex: s.duration }}
                        onClick={() => setShot(structuredClone(s))}
                      >
                        {s.number}
                        <small>{s.duration}s</small>
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}
            {page === "Prompt 中心" && (
              <>
                <div className="filterbar">
                  <label className="search">
                    <Search size={16} />
                    <input
                      placeholder="搜索提示词…"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                  </label>
                </div>
                <div className="prompt-grid">
                  {data.prompts
                    .filter((p) =>
                      `${p.title} ${p.category} ${p.content}`.includes(search),
                    )
                    .map((p) => (
                      <article className="prompt-card panel" key={p.id}>
                        <span className="tag">{p.category}</span>
                        <h3>{p.title}</h3>
                        <p>{p.content}</p>
                        <div>
                          <button
                            className="secondary"
                            onClick={async () => {
                              try {
                                await navigator.clipboard.writeText(p.content);
                                tell("提示词已复制");
                              } catch {
                                tell(
                                  "当前浏览器不支持剪贴板，请打开编辑后手动复制",
                                );
                              }
                            }}
                          >
                            <Copy size={14} />
                            复制
                          </button>
                          <button
                            className="text-button"
                            onClick={() => setPrompt({ ...p })}
                          >
                            编辑 <ArrowUpRight size={13} />
                          </button>
                        </div>
                      </article>
                    ))}
                </div>
              </>
            )}
            {page === "AI Agent" && (
              <div className="agent-layout">
                <section className="panel agent-main">
                  <span className="agent-orb">
                    <Sparkles size={32} />
                  </span>
                  <h2>让创作，保持流动。</h2>
                  <p>基于当前项目，检查资产、分析镜头、整理下一步。</p>
                  <div className="agent-options">
                    <button onClick={() => setReport(analyze(data))}>
                      <Box size={20} />
                      <strong>检查制作缺口</strong>
                      <small>资产完整度与镜头关联</small>
                    </button>
                    <button onClick={() => setReport(shotPrompt(data))}>
                      <Clapperboard size={20} />
                      <strong>生成镜头 Prompt</strong>
                      <small>从当前分镜整理提示词</small>
                    </button>
                    <button
                      onClick={() =>
                        setReport(
                          `制作计划（本地规则）\n\n${
                            data.tasks
                              .filter((t) => !t.done)
                              .map(
                                (t, i) =>
                                  `${i + 1}. [${t.priority}] ${t.title} · ${t.date}`,
                              )
                              .join("\n") || "当前任务已全部完成。"
                          }\n\n${analyze(data)}`,
                        )
                      }
                    >
                      <CalendarDays size={20} />
                      <strong>整理制作计划</strong>
                      <small>按现有任务与资产整理</small>
                    </button>
                  </div>
                  <div className="agent-output">
                    <span className="tag">本地规则引擎 · 无 API 费用</span>
                    <pre>
                      {report ||
                        "选择上方的操作，开始分析你的项目。\n本地分析读取当前编辑数据；云端 AI 读取最后推送的项目。"}
                    </pre>
                    {report && (
                      <button
                        className="secondary"
                        onClick={() => {
                          update({
                            prompts: [
                              {
                                id: uid(),
                                title: "Agent 制作建议",
                                category: "制作计划",
                                content: report,
                              },
                              ...data.prompts,
                            ],
                          });
                          tell("已保存到 Prompt 中心");
                        }}
                      >
                        保存到 Prompt 中心
                      </button>
                    )}
                  </div>
                </section>
                <aside className="panel ai-config">
                  <Sparkles size={24} />
                  <h3>连接 OpenAI</h3>
                  <p>
                    云端生成需配置服务器密钥、开启付费开关并登录。每次调用前都会向你确认。
                  </p>
                  <label>
                    你的问题
                    <textarea
                      value={question}
                      onChange={(e) => setQuestion(e.target.value)}
                      maxLength={1000}
                    />
                  </label>
                  <button className="primary" disabled={busy} onClick={paidAI}>
                    {busy ? (
                      <LoaderCircle className="spin" size={15} />
                    ) : (
                      <Sparkles size={15} />
                    )}
                    调用云端 AI
                  </button>
                  <small>
                    当前状态：未验证云端配置
                    <br />
                    本次开发未执行付费调用
                  </small>
                </aside>
              </div>
            )}
            <footer>
              <span>
                <Aperture size={13} /> FRAMEWORK STUDIO{" "}
                <em>从创意，到银幕。</em>
              </span>
              <span>
                独立创作，自有宇宙 <span className="green-dot">●</span>
              </span>
            </footer>
          </div>
        </main>
        {notice && (
          <div role="status" className="toast">
            <Check size={16} />
            {notice}
            <button aria-label="关闭提示" onClick={() => setNotice("")}>
              <X size={14} />
            </button>
          </div>
        )}
        {asset && (
          <Modal
            title={
              data.assets.some((a) => a.id === asset.id)
                ? "资产工作室"
                : "创建新资产"
            }
            onClose={() => setAsset(null)}
          >
            <div className="asset-editor">
              <div>
                <div className="editor-image">
                  <AssetImage
                    src={asset.image}
                    alt={asset.name || "新资产参考图"}
                  />
                </div>
                <label className="upload-button">
                  <Upload size={15} />
                  {busy ? "正在上传…" : "上传主图"}
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    disabled={busy}
                    onChange={(e) => upload(e.target.files?.[0])}
                  />
                </label>
                <small className="help">
                  JPG / PNG / WebP · 最大 5MB
                  <br />
                  {user
                    ? "上传到私有 Supabase Storage"
                    : "演示模式：保存在浏览器，请控制图片大小"}
                </small>
                <h4>
                  参考图 <span>{asset.references.length}</span>
                </h4>
                <div className="reference-grid">
                  {asset.references.map((r, i) => (
                    <div key={i}>
                      <AssetImage src={r} alt={`参考图 ${i + 1}`} />
                      <button
                        aria-label="移除参考图"
                        onClick={() =>
                          setAsset({
                            ...asset,
                            references: asset.references.filter(
                              (_, n) => n !== i,
                            ),
                          })
                        }
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                  <label className="reference-add">
                    <Plus size={21} />
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      disabled={busy}
                      onChange={(e) => upload(e.target.files?.[0], true)}
                    />
                  </label>
                </div>
              </div>
              <div className="editor-fields">
                <label>
                  资产名称
                  <input
                    autoFocus
                    value={asset.name}
                    onChange={(e) =>
                      setAsset({ ...asset, name: e.target.value })
                    }
                    placeholder="给你的资产一个名字"
                  />
                </label>
                <div className="field-pair">
                  <label>
                    资产分类
                    <select
                      value={asset.type}
                      onChange={(e) =>
                        setAsset({
                          ...asset,
                          type: e.target.value as Asset["type"],
                        })
                      }
                    >
                      {["人物", "场景", "道具"].map((s) => (
                        <option key={s}>{s}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    制作状态
                    <select
                      value={asset.status}
                      onChange={(e) =>
                        setAsset({
                          ...asset,
                          status: e.target.value as Asset["status"],
                        })
                      }
                    >
                      {["待制作", "制作中", "已完成"].map((s) => (
                        <option key={s}>{s}</option>
                      ))}
                    </select>
                  </label>
                </div>
                <label>
                  视觉设定与描述
                  <textarea
                    rows={4}
                    value={asset.description}
                    onChange={(e) =>
                      setAsset({ ...asset, description: e.target.value })
                    }
                    placeholder="外观、风格、材质、光线…"
                  />
                </label>
                <label>
                  生成模型 / 工作流
                  <input
                    value={asset.model}
                    onChange={(e) =>
                      setAsset({ ...asset, model: e.target.value })
                    }
                    placeholder="如 FLUX.1 / Midjourney（仅记录）"
                  />
                </label>
                <label>
                  标签
                  <input
                    value={asset.tags}
                    onChange={(e) =>
                      setAsset({ ...asset, tags: e.target.value })
                    }
                    placeholder="使用逗号分隔"
                  />
                </label>
                <div className="version-section">
                  <h4>
                    历史版本 <span>{asset.versions.length}</span>
                  </h4>
                  {asset.versions.length === 0 ? (
                    <small>再次保存时会保留上一版图片、设定及模型。</small>
                  ) : (
                    asset.versions.map((v, i) => (
                      <div className="version-row" key={i}>
                        <span>
                          v{asset.versions.length - i}.0 ·{" "}
                          {new Date(v.at).toLocaleString("zh-CN")}
                        </span>
                        <button
                          className="text-button"
                          onClick={() => {
                            setAsset({
                              ...asset,
                              image: v.image,
                              description: v.description,
                              model: v.model,
                            });
                            tell("历史内容已载入，点击保存以创建新版本");
                          }}
                        >
                          载入
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
            <div className="modal-actions">
              <button className="danger text-button" onClick={removeAsset}>
                <Trash2 size={14} />
                删除资产
              </button>
              <div>
                <button className="secondary" onClick={() => setAsset(null)}>
                  取消
                </button>
                <button className="primary" disabled={busy} onClick={saveAsset}>
                  <Check size={15} />
                  保存资产
                </button>
              </div>
            </div>
          </Modal>
        )}
        {shot && (
          <Modal title="分镜制作" onClose={() => setShot(null)}>
            <div className="editor-fields">
              <div className="field-pair">
                <label>
                  镜号
                  <input
                    value={shot.number}
                    onChange={(e) =>
                      setShot({ ...shot, number: e.target.value })
                    }
                  />
                </label>
                <label>
                  镜头名称
                  <input
                    value={shot.title}
                    onChange={(e) =>
                      setShot({ ...shot, title: e.target.value })
                    }
                  />
                </label>
              </div>
              <div className="field-pair">
                <label>
                  景别
                  <select
                    value={shot.size}
                    onChange={(e) => setShot({ ...shot, size: e.target.value })}
                  >
                    {["大全景", "全景", "中景", "近景", "特写"].map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                </label>
                <label>
                  时长（秒）
                  <input
                    type="number"
                    min="0.1"
                    max="600"
                    step="0.1"
                    value={shot.duration}
                    onChange={(e) =>
                      setShot({ ...shot, duration: Number(e.target.value) })
                    }
                  />
                </label>
              </div>
              <div className="field-pair">
                <label>
                  机位
                  <input
                    value={shot.camera}
                    onChange={(e) =>
                      setShot({ ...shot, camera: e.target.value })
                    }
                  />
                </label>
                <label>
                  运动方式
                  <input
                    value={shot.movement}
                    onChange={(e) =>
                      setShot({ ...shot, movement: e.target.value })
                    }
                  />
                </label>
              </div>
              <label>关联资产</label>
              <div className="asset-checkboxes">
                {data.assets.map((a) => (
                  <label key={a.id}>
                    <input
                      type="checkbox"
                      checked={shot.assets.includes(a.id)}
                      onChange={(e) =>
                        setShot({
                          ...shot,
                          assets: e.target.checked
                            ? [...shot.assets, a.id]
                            : shot.assets.filter((id) => id !== a.id),
                        })
                      }
                    />
                    {a.name}
                    <span>{a.type}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="modal-actions">
              <button
                className="danger text-button"
                onClick={() => {
                  if (confirm("删除此镜头？")) {
                    update({
                      shots: data.shots.filter((s) => s.id !== shot.id),
                    });
                    setShot(null);
                  }
                }}
              >
                删除镜头
              </button>
              <button
                className="primary"
                onClick={() => {
                  if (
                    !shot.title.trim() ||
                    !shot.number.trim() ||
                    !Number.isFinite(shot.duration) ||
                    shot.duration <= 0 ||
                    shot.duration > 600
                  )
                    return tell("请填写镜号、名称和有效时长（0.1～600 秒）");
                  if (
                    data.shots.some(
                      (s) => s.id !== shot.id && s.number === shot.number,
                    )
                  )
                    return tell("镜号已存在");
                  update({
                    shots: data.shots.some((s) => s.id === shot.id)
                      ? data.shots.map((s) => (s.id === shot.id ? shot : s))
                      : [...data.shots, shot],
                  });
                  setShot(null);
                  tell("分镜已保存");
                }}
              >
                保存分镜
              </button>
            </div>
          </Modal>
        )}
        {prompt && (
          <Modal title="编辑 Prompt" onClose={() => setPrompt(null)}>
            <div className="editor-fields">
              <label>
                标题
                <input
                  value={prompt.title}
                  onChange={(e) =>
                    setPrompt({ ...prompt, title: e.target.value })
                  }
                />
              </label>
              <label>
                分类
                <input
                  value={prompt.category}
                  onChange={(e) =>
                    setPrompt({ ...prompt, category: e.target.value })
                  }
                  placeholder="人物 / 场景 / 道具 / 制作计划"
                />
              </label>
              <label>
                提示词内容
                <textarea
                  rows={8}
                  value={prompt.content}
                  onChange={(e) =>
                    setPrompt({ ...prompt, content: e.target.value })
                  }
                />
              </label>
            </div>
            <div className="modal-actions">
              <button
                className="danger text-button"
                onClick={() => {
                  if (confirm("删除此 Prompt？")) {
                    update({
                      prompts: data.prompts.filter((p) => p.id !== prompt.id),
                    });
                    setPrompt(null);
                  }
                }}
              >
                删除
              </button>
              <button
                className="primary"
                onClick={() => {
                  if (!prompt.title.trim() || !prompt.content.trim())
                    return tell("请填写标题和内容");
                  update({
                    prompts: data.prompts.some((p) => p.id === prompt.id)
                      ? data.prompts.map((p) =>
                          p.id === prompt.id ? prompt : p,
                        )
                      : [prompt, ...data.prompts],
                  });
                  setPrompt(null);
                  tell("Prompt 已保存");
                }}
              >
                保存 Prompt
              </button>
            </div>
          </Modal>
        )}
        {settings && (
          <Modal title="项目与云端设置" onClose={() => setSettings(false)}>
            <div className="settings-layout">
              <div className="panel">
                <h3>
                  <Cloud size={18} /> Supabase 云端
                </h3>
                <p>
                  {supabase
                    ? "已检测到配置，请登录后同步。"
                    : "尚未配置。请按 README 设置环境变量，并运行 supabase/schema.sql。"}
                </p>
                {user ? (
                  <>
                    <p>已登录：{user}</p>
                    <div className="button-row">
                      <button
                        className="secondary"
                        disabled={busy}
                        onClick={() => sync("push")}
                      >
                        推送到云端
                      </button>
                      <button
                        className="secondary"
                        disabled={busy}
                        onClick={() => sync("pull")}
                      >
                        从云端载入
                      </button>
                      <button
                        className="text-button"
                        onClick={async () => {
                          const result = await supabase?.auth.signOut();
                          if (result?.error) tell("退出失败，请检查网络后重试");
                        }}
                      >
                        退出
                      </button>
                    </div>
                    <small>
                      {cloudAt ? `上次同步 ${cloudAt}` : "尚未同步当前更改"}
                    </small>
                  </>
                ) : (
                  <div className="editor-fields">
                    <label>
                      邮箱
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="you@example.com"
                      />
                    </label>
                    <button
                      className="secondary"
                      disabled={!supabase || busy || !email.includes("@")}
                      onClick={() => login()}
                    >
                      发送登录邮件
                    </button>
                    <label>
                      邮件验证码（可选）
                      <input
                        value={otp}
                        onChange={(e) => setOtp(e.target.value)}
                        placeholder="或直接点击邮件登录链接"
                      />
                    </label>
                    <button
                      className="secondary"
                      disabled={!supabase || busy || !otp}
                      onClick={() => login(true)}
                    >
                      验证并登录
                    </button>
                  </div>
                )}
              </div>
              <div className="panel">
                <h3>项目备份</h3>
                <p>
                  演示数据和每个登录账号分别缓存。登录后先从云端载入；若要迁移原来的数据，请在未登录时导出
                  JSON，再登录并导入云端。云端导入会保留资产
                  ID、版本和分镜关联。
                </p>
                <button className="secondary" onClick={exportData}>
                  <ArrowDownToLine size={15} />
                  导出 JSON 备份
                </button>
                {userId && (
                  <label className="upload-button">
                    导入 JSON 备份到云端（含本地图片）
                    <input
                      type="file"
                      accept="application/json"
                      disabled={busy}
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        try {
                          if (file.size > 20 * 1024 * 1024)
                            throw Error("文件超过 20MB");
                          await sync(
                            "push",
                            parseStudio(JSON.parse(await file.text())),
                          );
                        } catch (error) {
                          tell(`导入失败：${(error as Error).message}`);
                        }
                        e.target.value = "";
                      }}
                    />
                  </label>
                )}
                <label className="upload-button">
                  导入项目备份到本地
                  <input
                    type="file"
                    accept="application/json"
                    onChange={async (e) => {
                      const f = e.target.files?.[0];
                      if (!f) return;
                      try {
                        if (f.size > 20 * 1024 * 1024)
                          throw Error("文件超过 20MB");
                        const d = parseStudio(JSON.parse(await f.text()));
                        if (confirm("导入将替换当前本地项目，是否继续？")) {
                          setData(d);
                          setCloudAt("");
                          tell("已导入项目");
                        }
                      } catch (e) {
                        tell(`导入失败：${(e as Error).message}`);
                      }
                    }}
                  />
                </label>
                <button
                  className="danger text-button"
                  onClick={() => {
                    if (confirm("恢复示例数据将覆盖当前项目，是否继续？")) {
                      setData(structuredClone(seed));
                      setCloudAt("");
                      tell("已恢复示例项目");
                    }
                  }}
                >
                  恢复示例项目
                </button>
              </div>
              <div className="help">
                OpenAI 密钥仅配置在服务端。付费开关默认为关闭；AI Agent
                的本地检查和 Prompt 模板无需密钥。
              </div>
            </div>
          </Modal>
        )}
      </div>
      {busy && (
        <div className="operation-overlay" role="status">
          <LoaderCircle className="spin" size={24} />
          <span>正在处理，请稍候…</span>
        </div>
      )}
    </>
  );
}
function AssetImage({ src, alt }: { src: string; alt: string }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    let active = true;
    setUrl("");
    if (src.startsWith("storage:") && supabase) {
      supabase.storage
        .from("assets")
        .createSignedUrl(src.slice(8), 3600)
        .then(({ data }) => {
          if (active) setUrl(data?.signedUrl || "");
        });
    } else if (
      src.startsWith("/art/") ||
      /^data:image\/(png|jpeg|webp);base64,/.test(src)
    )
      setUrl(src);
    return () => {
      active = false;
    };
  }, [src]);
  return url ? (
    <img src={url} alt={alt} onError={() => setUrl("")} />
  ) : (
    <div className="image-placeholder">
      <ImagePlus size={32} />
      <span>等待你的灵感</span>
    </div>
  );
}
function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    const handle = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab") {
        const nodes = Array.from(
          document.querySelectorAll<HTMLElement>(
            '[role="dialog"] button:not(:disabled),[role="dialog"] input:not(:disabled),[role="dialog"] select,[role="dialog"] textarea,[role="dialog"] [tabindex="0"]',
          ),
        ).filter((n) => n.getClientRects().length);
        const first = nodes[0],
          last = nodes[nodes.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", handle);
    const old = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.querySelector<HTMLElement>('[role="dialog"] button')?.focus();
    return () => {
      document.removeEventListener("keydown", handle);
      document.body.style.overflow = old;
      before?.focus();
    };
  }, []);
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="modal"
      >
        <div className="modal-header">
          <span>
            <Aperture size={18} />
            {title}
          </span>
          <button
            className="icon-button"
            aria-label="关闭窗口"
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}
