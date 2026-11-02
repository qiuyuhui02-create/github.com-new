"use client";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  useRef,
  useSyncExternalStore,
} from "react";
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
import EmailLogin from "@/components/auth/email-login";
import { legacyFragmentReason } from "@/lib/auth/legacy";
import MediaLibrary from "@/components/media-library";
import ScriptWorkbench from "@/components/script-workbench";
import { shotNeedsReview } from "@/lib/screenplay";
import {
  downloadBlob,
  describeFile,
  bindMedia,
  clearMedia,
  mediaURL,
  mediaStatus,
  mediaSnapshot,
  subscribeMedia,
} from "@/lib/media";
import {
  cacheKey,
  emptyStudio,
  loadCloud,
  saveCloud,
  verifiedClient,
} from "@/lib/cloud";
import MobileReader from "@/components/mobile-reader";
import { editProject, timestamp } from "@/lib/snapshots";
import { manualSceneShot, nextShotNumber, moveShot } from "@/lib/production";
import CreativeSchedule from "@/components/creative-schedule";
import VideoProduction from "@/components/video-production";
import {
  readWorkspace,
  writeWorkspace,
  readTimer,
  changeTimer,
  replaceWorkspace,
} from "@/lib/persistence";
import { thumbnail } from "@/lib/previews";
import BackupImportDialog, {
  BackupStatus,
  useBackupReceipt,
} from "@/components/backup-controls";
import { backupJSON, readBackupFile } from "@/lib/backups";
const PreviewContext = createContext<Record<string, string>>({});
const modules = [
  { name: "创作日程", icon: CalendarDays },
  { name: "剧本工作台", icon: Film },
  { name: "资产库", icon: LayoutGrid },
  { name: "分镜工作台", icon: Clapperboard },
  { name: "视频提示词与制作", icon: Clapperboard },
  { name: "本地素材库", icon: Folder },
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
    [page, setPage] = useState("创作日程"),
    [search, setSearch] = useState(""),
    [category, setCategory] = useState("全部资产"),
    [status, setStatus] = useState("全部状态"),
    [view, setView] = useState("grid"),
    [notice, setNotice] = useState(""),
    [asset, setAsset] = useState<Asset | null>(null),
    [shot, setShot] = useState<Shot | null>(null),
    [prompt, setPrompt] = useState<Prompt | null>(null),
    [settings, setSettings] = useState(false),
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
  const [shotView, setShotView] = useState<"grid" | "nine">("grid"),
    [shotPage, setShotPage] = useState(0);
  const ninePage = Math.min(
    shotPage,
    Math.max(0, Math.ceil(data.shots.length / 9) - 1),
  );
  const [readerMode, setReaderMode] = useState(false);
  useEffect(() => {
    setReaderMode(window.matchMedia("(max-width:760px)").matches);
  }, []);
  const [storageBlocked, setStorageBlocked] = useState(false);
  const [saveState, setSaveState] = useState("正在载入");
  const [userId, setUserId] = useState<string | null>(null);
  const [cloudVersion, setCloudVersion] = useState(0);
  const [cloudVerified, setCloudVerified] = useState(false);
  const activeUser = useRef<string | null>(null);
  const accountEpoch = useRef(0);
  const lastMirror = useRef<string | null>(null);
  const [saveProblem, setSaveProblem] = useState("");
  const backupState = useBackupReceipt(cacheKey(userId), ready);
  const [pendingImport, setPendingImport] = useState<{
    data: Studio;
    fileName: string;
    epoch: number;
  } | null>(null);
  const [importBusy, setImportBusy] = useState(false),
    [importError, setImportError] = useState("");

  const tell = (s: string) => setNotice(s);
  useEffect(() => {
    if (!importBusy) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [importBusy]);
  useEffect(() => {
    async function selectAccount(id: string | null, email: string) {
      if (activeUser.current === id && initialized) return;
      initialized = true;
      const epoch = ++accountEpoch.current;
      clearMedia();
      activeUser.current = id;
      setReady(false);
      setStorageBlocked(false);
      setSaveProblem("");
      setUserId(id);
      setUser(email);
      setCloudAt("");
      setCloudVerified(false);
      setAsset(null);
      setShot(null);
      setPrompt(null);
      setReport("");
      setPendingImport(null);
      setImportError("");
      let next = id ? emptyStudio() : structuredClone(seed),
        version = 0;
      try {
        const raw = await readWorkspace(cacheKey(id));
        lastMirror.current = localStorage.getItem(cacheKey(id));
        if (raw) {
          const parsed = JSON.parse(raw);
          next = parseStudio(id ? parsed.data : parsed);
          version =
            id && Number.isSafeInteger(parsed.version) ? parsed.version : 0;
        }
      } catch {
        setStorageBlocked(true);
        setNotice(
          "本地缓存无法读取，已停止自动保存以保护原数据。请先导出原缓存备份，再导入有效备份恢复。",
        );
      }
      if (accountEpoch.current !== epoch) return;
      setData(next);
      setCloudVersion(version);
      setReady(true);
    }
    let initialized = false;
    selectAccount(null, "");
    const fragmentError = legacyFragmentReason(location.hash);
    if (fragmentError) {
      location.replace(`/auth/login?reason=${fragmentError}`);
    }
    if (new URLSearchParams(location.search).has("auth_error")) {
      setSettings(true);
      setNotice(
        "旧版登录回调未完成，请使用邮箱验证码。此提示不代表项目数据丢失。",
      );
      history.replaceState(null, "", "/");
    }
    // Supabase emits INITIAL_SESSION. Do not run async Supabase calls inside this callback.
    const sub = supabase?.auth.onAuthStateChange((_event, session) =>
      selectAccount(session?.user.id || null, session?.user.email || ""),
    );
    return () => sub?.data.subscription.unsubscribe();
  }, []);
  useEffect(() => {
    if (!ready || storageBlocked) return;
    let cancelled = false;
    setSaveState("正在保存…");
    const raw = JSON.stringify(userId ? { data, version: cloudVersion } : data);
    void writeWorkspace(cacheKey(userId), raw, lastMirror.current)
      .then(() => {
        if (!cancelled) setSaveState("已保存在此浏览器");
      })
      .catch((e) => {
        if (!cancelled) {
          setSaveState("保存失败 · 请导出备份");
          setSaveProblem(e.message);
          setNotice(e.message);
        }
      });
    try {
      const current = localStorage.getItem(cacheKey(userId));
      if (current === raw) lastMirror.current = current;
    } catch {}
    return () => {
      cancelled = true;
    };
  }, [data, ready, userId, cloudVersion, storageBlocked]);
  useEffect(() => {
    if (notice) {
      const t = setTimeout(() => setNotice(""), 6000);
      return () => clearTimeout(t);
    }
  }, [notice]);
  const update = (next: Partial<Studio>) => {
    setData((d) => editProject(d, next));
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
            ]
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
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type))
      return tell("请选择 JPG、PNG 或 WebP 图片");
    const epoch = accountEpoch.current;
    setBusy(true);
    try {
      const previous = (data.files || []).find(
        (f) => `local:${f.id}` === asset.image,
      );
      const entry = await describeFile(
        file,
        reference || ["服装", "其他"].includes(asset.type)
          ? "参考图"
          : (asset.type as "人物" | "场景" | "道具"),
        {
          assetId: asset.id,
          ...(!reference && previous
            ? { previousId: previous.id, version: previous.version + 1 }
            : {}),
        },
      );
      if (accountEpoch.current !== epoch) return;
      bindMedia(entry.id, file);
      update({ files: [...(data.files || []), entry] });
      const preview = await thumbnail(file);
      if (accountEpoch.current !== epoch) return;
      update({ previews: { ...data.previews, [entry.id]: preview } });
      const image = `local:${entry.id}`;
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
        "本地文件已登记，未上传。请保存资产，并在本地素材库按清单归档原件。",
      );
    } catch (e) {
      tell((e as Error).message);
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
            ? "仅导入轻量元数据到云端，媒体原件保存在 Windows 连接的 SSD。旧 Base64 请先在本地素材库迁移。是否继续？"
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
        const migrated = imported || data;
        if (accountEpoch.current !== epoch) return;
        const result = await saveCloud(db, migrated, cloudVersion);
        if (accountEpoch.current !== epoch) return;
        setData({
          ...migrated,
          previews: data.previews,
          journals: data.journals,
          timer: readTimer(cacheKey(userId), data.timer || { entries: [] }),
        });
        setCloudVersion(result.version);
        setCloudAt(result.at);
      } else {
        const result = await loadCloud(db, owner);
        if (accountEpoch.current !== epoch) return;
        if (!result) {
          tell("云端暂无项目，保留当前本地内容");
          return;
        }
        setData({
          ...result.data,
          previews: data.previews,
          journals: data.journals,
          timer: readTimer(cacheKey(userId), data.timer || { entries: [] }),
        });
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
  async function previewImport(file: File) {
    if (busy || importBusy || !ready) return;
    const epoch = accountEpoch.current;
    try {
      const incoming = await readBackupFile(file);
      if (accountEpoch.current !== epoch) return;
      setSettings(false);
      setImportError("");
      setPendingImport({ data: incoming, fileName: file.name, epoch });
    } catch (e) {
      tell(`导入失败：${(e as Error).message}`);
    }
  }
  async function confirmImport() {
    if (!pendingImport || importBusy || busy || !ready) return;
    const pending = pendingImport,
      epoch = accountEpoch.current,
      key = cacheKey(userId);
    if (pending.epoch !== epoch) {
      setPendingImport(null);
      return tell("工作空间已变化，请重新选择备份");
    }
    setImportBusy(true);
    setImportError("");
    try {
      const recoveryRaw = storageBlocked
        ? (await readWorkspace(key)) || JSON.stringify(data)
        : backupJSON(snapshot());
      await replaceWorkspace({
        key,
        raw: JSON.stringify(
          userId ? { data: pending.data, version: cloudVersion } : pending.data,
        ),
        recoveryRaw,
        timer: pending.data.timer || { entries: [] },
        expectedMirror: lastMirror.current,
        guard: () => accountEpoch.current === epoch,
      });
      if (accountEpoch.current !== epoch) return;
      lastMirror.current = localStorage.getItem(key);
      clearMedia();
      setData(pending.data);
      setStorageBlocked(false);
      setSaveProblem("");
      setCloudAt("");
      setPendingImport(null);
      tell(
        readerMode
          ? "项目快照已导入，仅保存在当前设备"
          : "已导入项目，仅保存在当前设备；导入前副本已保留",
      );
    } catch (e) {
      if (accountEpoch.current === epoch)
        setImportError((e as Error).message || "本地存储不可用，原项目未修改");
    } finally {
      setImportBusy(false);
    }
  }
  function snapshot(): Studio {
    const timer = readTimer(cacheKey(userId), data.timer || { entries: [] });
    return data.timer || localStorage.getItem(cacheKey(userId) + ":timer")
      ? { ...data, timer }
      : data;
  }
  function exportData() {
    if (!ready || importBusy) return tell("请等待项目载入或恢复完成");
    try {
      const raw = storageBlocked
        ? localStorage.getItem(cacheKey(userId)) || JSON.stringify(data)
        : backupJSON(snapshot());
      downloadBlob(
        new Blob([raw], { type: "application/json" }),
        `framework-studio-${new Date().toISOString().replace(/[:.]/g, "-")}.json`,
      );
      if (!storageBlocked) void backupState.generated(new Date().toISOString());
      tell(
        storageBlocked
          ? "原始缓存已导出，请保留用于恢复排查；这不是已验证的完整项目备份"
          : "项目快照已导出（包含私人日记与缩略图），请确认文件已保存；不含外部高清原图或视频",
      );
    } catch (e) {
      tell(`导出失败：${(e as Error).message}。请勿清理浏览器数据。`);
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
  async function uploadVideoReference(
    jobId: string,
    role:
      | "firstFrame"
      | "lastFrame"
      | "storyboardReference"
      | "characterReferences",
    file: File,
  ) {
    const job = data.videoJobs?.find((j) => j.id === jobId);
    if (!job) return;
    if (
      role !== "characterReferences" &&
      job[role] &&
      !confirm("替换此用途的参考图引用？原件与已保存版本不会删除。")
    )
      return;
    const epoch = accountEpoch.current;
    setBusy(true);
    try {
      const preview = await thumbnail(file),
        entry = await describeFile(
          file,
          role === "storyboardReference" ? "分镜图" : "参考图",
          { shotId: job.shotId },
        );
      if (accountEpoch.current !== epoch) return;
      bindMedia(entry.id, file);
      setData((current) =>
        editProject(current, {
          files: [...(current.files || []), entry],
          previews: { ...current.previews, [entry.id]: preview },
          videoJobs: current.videoJobs?.map((j) =>
            j.id === jobId
              ? {
                  ...j,
                  [role]:
                    role === "characterReferences" && j.characterReferences
                      ? j.characterReferences + "\n" + `local:${entry.id}`
                      : `local:${entry.id}`,
                }
              : j,
          ),
        }),
      );
      tell("参考图已按用途保存到本地，未调用生成或上传 API");
    } catch (e) {
      tell((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const newShot = () =>
    setShot({
      id: uid(),
      number: nextShotNumber(data.shots),
      title: "",
      size: "中景",
      duration: 4,
      camera: "平视",
      movement: "固定",
      assets: [],
    });
  return (
    <PreviewContext.Provider value={data.previews || {}}>
      {readerMode ? (
        ready ? (
          <MobileReader
            saveStatus={
              storageBlocked
                ? "缓存异常，原数据未覆盖"
                : saveProblem || saveState
            }
            data={data}
            onImportFile={previewImport}
            backupStatus={
              <BackupStatus state={backupState} onExport={exportData} />
            }
            onExport={exportData}
            tell={tell}
            onEdit={() => setReaderMode(false)}
          />
        ) : (
          <main className="mobile-reader" role="status">
            正在载入本机项目，请稍候…
          </main>
        )
      ) : (
        <div className="studio-shell" inert={busy || !ready}>
          <aside className="sidebar">
            <a className="brand" href="/" aria-label="aikari 首页">
              <span className="brand-icon">
                <Aperture size={26} />
              </span>
              <span>
                aikari<small>个人电影创作手册</small>
              </span>
            </a>
            <div className="workspace-label">
              工作空间 <span>⌘ K</span>
            </div>
            <button
              className="project-switch"
              onClick={() => setSettings(true)}
            >
              <span className="project-icon">
                <Film size={19} />
              </span>
              <span>
                {data.projectName || "我的毕业短片"}
                <small>个人电影创作工作室</small>
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
                  {m.name === "资产库" ? (
                    <span className="nav-count">{data.assets.length}</span>
                  ) : m.name === "AI Agent" ? (
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
                <p>用自己的节奏，把故事变成电影。</p>
                <button onClick={() => setPage("AI Agent")}>
                  本地制作检查 <ArrowUpRight size={14} />
                </button>
              </div>
              <button className="nav-item" onClick={() => setSettings(true)}>
                <Settings2 size={17} />
                项目与云端设置
              </button>
              <div className="profile">
                <span>F</span>
                <div>
                  独立创作者<small>{user || "本地创作工作空间"}</small>
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
                <span>{data.projectName || "我的毕业短片"}</span>
                <span className="header-divider" />
                <span className="project-chip">短片项目</span>
              </div>
              <div>
                <span className="save-state">
                  <i />
                  {storageBlocked
                    ? "缓存异常 · 已停止自动保存"
                    : ready
                      ? saveState
                      : "正在载入"}
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
              <div className="device-toolbar">
                <span>
                  本机版本 v
                  {data.meta?.revision ?? data.snapshot?.revision ?? 0} ·
                  最后更新{" "}
                  {timestamp(data.meta?.updatedAt || data.snapshot?.updatedAt)}
                </span>
                <button
                  className="text-button"
                  onClick={() => setReaderMode(true)}
                >
                  手机查看模式
                </button>
              </div>
              <BackupStatus state={backupState} onExport={exportData} />
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
                        : page === "创作日程"
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
                      page === "剧本工作台"
                        ? document
                            .querySelector<HTMLTextAreaElement>(
                              '[aria-label="原始剧本导入"],[aria-label="场景修改稿"]',
                            )
                            ?.focus()
                        : page === "本地素材库"
                          ? document
                              .querySelector<HTMLInputElement>(
                                ".media-library input[type=file]",
                              )
                              ?.click()
                          : page.startsWith("资产")
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
                                  : document
                                      .querySelector<HTMLButtonElement>(
                                        "[data-new-task]",
                                      )
                                      ?.click()
                    }
                  >
                    <Plus size={16} />
                    {page === "剧本工作台"
                      ? "编辑剧本"
                      : page === "本地素材库"
                        ? "登记素材"
                        : page.startsWith("资产")
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
                  <span className="demo-pill">LOCAL FIRST</span>
                  {user
                    ? `已登录 · ${cloudVerified ? "云端读写已验证" : "云端尚未验证"} · 更改先保存在本地，请手动推送。`
                    : "本地模式 · 无需登录，全部核心功能可用。请定期导出 JSON 备份；原始素材由你自行保管。"}
                </span>
                <button onClick={() => setSettings(true)}>
                  备份与设置 <ArrowUpRight size={13} />
                </button>
              </div>
              {saveProblem && (
                <p className="auth-error" role="alert">
                  {saveProblem}
                </p>
              )}
              {storageBlocked && (
                <p className="auth-error" role="alert">
                  原缓存格式异常，已停止自动保存，原数据未覆盖。请先点击“导出项目”保存原缓存，再从备份恢复。
                </p>
              )}
              {page === "剧本工作台" && ready && (
                <ScriptWorkbench
                  key={userId || "demo"}
                  data={data}
                  onCreateShot={(sceneId) => {
                    try {
                      setShot(manualSceneShot(data, sceneId));
                      setPage("分镜工作台");
                    } catch (e) {
                      tell((e as Error).message);
                    }
                  }}
                  onChange={(d) => {
                    if (activeUser.current === userId) update(d);
                  }}
                  tell={tell}
                />
              )}
              {page === "本地素材库" && (
                <MediaLibrary
                  key={userId || "demo"}
                  data={data}
                  onChange={(d) => {
                    if (activeUser.current === userId) update(d);
                  }}
                  tell={tell}
                />
              )}
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
                      {["全部资产", "人物", "场景", "道具", "服装", "其他"].map(
                        (c) => (
                          <button
                            className={category === c ? "selected" : ""}
                            key={c}
                            onClick={() => setCategory(c)}
                          >
                            {c}
                            <span>
                              {c === "全部资产"
                                ? data.assets.length
                                : data.assets.filter((a) => a.type === c)
                                    .length}
                            </span>
                          </button>
                        ),
                      )}
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
              {page === "创作日程" && ready && (
                <CreativeSchedule
                  key={userId || "local"}
                  data={data}
                  onChange={update}
                  tell={tell}
                  scope={cacheKey(userId)}
                />
              )}
              {page === "视频提示词与制作" && (
                <VideoProduction
                  data={data}
                  onChange={update}
                  tell={tell}
                  onReferenceFile={uploadVideoReference}
                  renderReference={(src, alt) => (
                    <AssetImage src={src} alt={alt} />
                  )}
                />
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
                  <div className="shot-toolbar panel">
                    <div className="button-row">
                      <button
                        className={
                          shotView === "grid" ? "primary" : "secondary"
                        }
                        onClick={() => setShotView("grid")}
                      >
                        全部镜头
                      </button>
                      <button
                        className={
                          shotView === "nine" ? "primary" : "secondary"
                        }
                        onClick={() => setShotView("nine")}
                      >
                        九宫格总览
                      </button>
                    </div>
                    <label>
                      从已定稿场景手动新建
                      <select
                        aria-label="从已定稿场景手动新建"
                        value=""
                        onChange={(e) => {
                          try {
                            setShot(manualSceneShot(data, e.target.value));
                          } catch (error) {
                            tell((error as Error).message);
                          }
                        }}
                      >
                        <option value="">选择场景并编辑新镜头……</option>
                        {data.script?.scenes
                          .filter((s) => s.final && s.status === "已定稿")
                          .map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.heading}
                            </option>
                          ))}
                      </select>
                    </label>
                    <p className="help">
                      参考图只供分镜规划，不会自动作为视频首帧或尾帧。
                    </p>
                  </div>
                  {shotView === "nine" && (
                    <div className="nine-pagination">
                      <button
                        className="secondary"
                        disabled={ninePage === 0}
                        onClick={() => setShotPage(ninePage - 1)}
                      >
                        上一组九宫格
                      </button>
                      <span>
                        第 {ninePage + 1} /{" "}
                        {Math.max(1, Math.ceil(data.shots.length / 9))} 组 ·
                        每组 9 格
                      </span>
                      <button
                        className="secondary"
                        disabled={(ninePage + 1) * 9 >= data.shots.length}
                        onClick={() => setShotPage(ninePage + 1)}
                      >
                        下一组九宫格
                      </button>
                    </div>
                  )}
                  <div
                    className={`shot-grid ${shotView === "nine" ? "nine-grid" : ""}`}
                  >
                    {(shotView === "nine"
                      ? data.shots.slice(ninePage * 9, ninePage * 9 + 9)
                      : data.shots
                    ).map((s, localIndex) => {
                      const i =
                        shotView === "nine"
                          ? ninePage * 9 + localIndex
                          : localIndex;
                      return (
                        <article className="shot-card panel" key={s.id}>
                          <button
                            className="shot-visual"
                            onClick={() => setShot(structuredClone(s))}
                          >
                            <AssetImage
                              src={
                                s.image ||
                                data.assets.find((a) => a.id === s.assets[0])
                                  ?.image ||
                                ""
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
                            {shotNeedsReview(s, data) && (
                              <p className="shot-warning">
                                来源剧本已变化，镜头可能需要更新（未自动覆盖）
                              </p>
                            )}
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
                                  update({
                                    shots: moveShot(data.shots, s.id, -1),
                                  });
                                }}
                              >
                                前移
                              </button>
                              <button
                                className="text-button"
                                disabled={i === data.shots.length - 1}
                                onClick={() =>
                                  update({
                                    shots: moveShot(data.shots, s.id, 1),
                                  })
                                }
                              >
                                后移
                              </button>
                            </div>
                          </div>
                        </article>
                      );
                    })}
                    {shotView === "nine" &&
                      Array.from(
                        {
                          length:
                            9 -
                            data.shots.slice(ninePage * 9, ninePage * 9 + 9)
                              .length,
                        },
                        (_, i) => (
                          <div className="nine-placeholder" key={`empty-${i}`}>
                            空镜位{" "}
                            {ninePage * 9 +
                              data.shots.slice(ninePage * 9, ninePage * 9 + 9)
                                .length +
                              i +
                              1}
                          </div>
                        ),
                      )}
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
                        `${p.title} ${p.category} ${p.content}`.includes(
                          search,
                        ),
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
                                  await navigator.clipboard.writeText(
                                    p.content,
                                  );
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
                          "选择上方的操作，开始分析你的项目。\n本地分析读取当前编辑数据；不发送项目内容到 AI 服务。"}
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
                    <h3>安心创作，完全免费</h3>
                    <p>
                      这里使用本地规则检查制作缺口，不调用 AI
                      API。剧本对比请在剧本工作台手动粘贴模型结果。
                    </p>
                  </aside>
                </div>
              )}
              <footer>
                <span>
                  <Aperture size={13} /> aikari <em>从创意，到银幕。</em>
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
                    {busy ? "正在上传…" : "选择本地主图"}
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      disabled={busy}
                      onChange={(e) => upload(e.target.files?.[0])}
                    />
                  </label>
                  <small className="help">
                    JPG / PNG / WebP · 本地文件，不上传
                    <br />
                    {"原件保存在本地 SSD；此设备未连接时仍可编辑文字"}
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
                        {["人物", "场景", "道具", "服装", "其他"].map((s) => (
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
                  <button
                    className="primary"
                    disabled={busy}
                    onClick={saveAsset}
                  >
                    <Check size={15} />
                    保存资产
                  </button>
                </div>
              </div>
            </Modal>
          )}
          {shot && (
            <Modal title="分镜工作台" onClose={() => setShot(null)}>
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
                      onChange={(e) =>
                        setShot({ ...shot, size: e.target.value })
                      }
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
                <label>
                  来源剧本场景
                  <select
                    value={shot.sourceSceneId || ""}
                    onChange={(e) => {
                      const scene = data.script?.scenes.find(
                        (s) => s.id === e.target.value,
                      );
                      setShot({
                        ...shot,
                        sourceSceneId: scene?.id,
                        sourceFinalRevision: scene?.final?.revision,
                      });
                    }}
                  >
                    <option value="">未关联场景</option>
                    {data.script?.scenes
                      .filter(
                        (s) =>
                          s.final &&
                          (s.status === "已定稿" ||
                            s.id === shot.sourceSceneId),
                      )
                      .map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.heading}
                        </option>
                      ))}
                  </select>
                </label>
                <label>
                  分镜参考图
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      const epoch = accountEpoch.current;
                      try {
                        const preview = await thumbnail(file),
                          entry = await describeFile(file, "分镜图", {
                            shotId: shot.id,
                          });
                        if (accountEpoch.current === epoch) {
                          bindMedia(entry.id, file);
                          update({
                            files: [...(data.files || []), entry],
                            previews: { ...data.previews, [entry.id]: preview },
                          });
                          setShot((current) =>
                            current
                              ? { ...current, image: `local:${entry.id}` }
                              : current,
                          );
                        }
                      } catch (error) {
                        tell((error as Error).message);
                      }
                    }}
                  />
                </label>
                {(
                  [
                    ["composition", "构图"],
                    ["description", "画面描述"],
                    ["dialogue", "对白"],
                    ["sound", "环境音与音效说明"],
                  ] as const
                ).map(([key, label]) => (
                  <label key={key}>
                    {label}
                    <textarea
                      rows={3}
                      value={shot[key] || ""}
                      onChange={(e) =>
                        setShot({ ...shot, [key]: e.target.value })
                      }
                    />
                  </label>
                ))}
                <label>
                  镜头制作状态
                  <select
                    value={shot.status || "待制作"}
                    onChange={(e) =>
                      setShot({ ...shot, status: e.target.value })
                    }
                  >
                    {["待制作", "制作中", "待审核", "已完成"].map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                </label>
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
                      : "尚未配置。请检查 Vercel 的 Supabase URL 和 Publishable Key；修复登录不需要执行 SQL。"}
                  </p>
                  {user ? (
                    <>
                      <p>已登录：{user}</p>
                      <a className="secondary" href="/auth/security">
                        账号安全 · 设置密码
                      </a>
                      <p className="help">
                        首次 Magic Link
                        登录后可设置密码；后续各设备使用同一邮箱和密码。
                      </p>
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
                            if (result?.error)
                              tell("退出失败，请检查网络后重试");
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
                    <EmailLogin onMessage={tell} />
                  )}
                </div>
                <div className="panel">
                  <h3>项目备份</h3>
                  <p>
                    本地模式无需登录。项目、日程、工时、心情、剧本与视频 Prompt
                    均包含在 JSON
                    备份内（含小缩略图，不含原始素材）。请定期导出到
                    SSD；清理浏览器数据或无痕模式可能丢失本地内容。
                  </p>
                  <button className="secondary" onClick={exportData}>
                    <ArrowDownToLine size={15} />
                    导出 JSON 备份
                  </button>
                  {userId && (
                    <label className="upload-button">
                      导入 JSON 元数据到云端（不含媒体）
                      <input
                        type="file"
                        accept="application/json"
                        disabled={busy}
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          try {
                            if (file.size > 100 * 1024 * 1024)
                              throw Error("文件超过 100MB");
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
                        const input = e.currentTarget,
                          file = input.files?.[0];
                        if (file) await previewImport(file);
                        input.value = "";
                      }}
                    />
                  </label>
                  <button
                    className="secondary"
                    onClick={async () => {
                      try {
                        const raw = await readWorkspace(
                          cacheKey(userId) + ":recovery",
                        );
                        if (!raw) return tell("还没有导入前快照");
                        downloadBlob(
                          new Blob([raw], { type: "application/json" }),
                          "framework-before-restore.json",
                        );
                      } catch {
                        tell("无法读取恢复快照");
                      }
                    }}
                  >
                    导出上次导入前快照
                  </button>
                </div>
                <div className="help">
                  本版本禁用外部 AI 调用。不需要 API
                  Key、SMTP、数据库迁移或付费服务。
                </div>
              </div>
            </Modal>
          )}
        </div>
      )}
      {pendingImport && (
        <BackupImportDialog
          data={pendingImport.data}
          current={data}
          fileName={pendingImport.fileName}
          busy={importBusy}
          error={importError}
          onCancel={() => {
            setPendingImport(null);
            setImportError("");
          }}
          onConfirm={() => void confirmImport()}
        />
      )}
      {readerMode && notice && (
        <div className="toast" role="status">
          {notice}
        </div>
      )}
      {busy && (
        <div className="operation-overlay" role="status">
          <LoaderCircle className="spin" size={24} />
          <span>正在处理，请稍候…</span>
        </div>
      )}
    </PreviewContext.Provider>
  );
}
function AssetImage({ src, alt }: { src: string; alt: string }) {
  const previews = useContext(PreviewContext);
  const [url, setUrl] = useState("");
  const mediaGeneration = useSyncExternalStore(
    subscribeMedia,
    mediaSnapshot,
    () => 0,
  );
  useEffect(() => {
    let active = true;
    setUrl("");
    if (src.startsWith("local:"))
      setUrl(mediaURL(src.slice(6)) || previews[src.slice(6)] || "");
    else if (src.startsWith("storage:") && supabase) {
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
  }, [src, mediaGeneration, previews]);
  return url ? (
    <img src={url} alt={alt} onError={() => setUrl("")} />
  ) : (
    <div className="image-placeholder">
      <ImagePlus size={32} />
      <span>
        {src.startsWith("local:") ? mediaStatus(src.slice(6)) : "等待你的灵感"}
      </span>
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
