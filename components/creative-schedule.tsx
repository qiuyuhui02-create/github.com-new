"use client";
import { useEffect, useState } from "react";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Play,
  Pause,
  Square,
  Clock3,
  Pencil,
  Plus,
} from "lucide-react";
import type { Studio, Task } from "@/lib/model";
import { uid } from "@/lib/model";
import {
  categories,
  moods,
  elapsed,
  localDate,
  timeText,
  timerAction,
  type TimeEntry,
  type TimerLedger,
} from "@/lib/workflow";
import { changeTimer, readTimer } from "@/lib/persistence";
const blankTask = (date: string): Task => ({
  id: uid(),
  title: "",
  date,
  priority: "中",
  done: false,
  time: "",
  location: "",
  category: "图片与资产",
  status: "待开始",
  notes: "",
});
export default function CreativeSchedule({
  data,
  onChange,
  tell,
  scope,
}: {
  data: Studio;
  onChange: (s: Partial<Studio>) => void;
  tell: (s: string) => void;
  scope: string;
}) {
  const [date, setDate] = useState(localDate()),
    [month, setMonth] = useState(localDate().slice(0, 7)),
    [task, setTask] = useState<Task | null>(null),
    [filter, setFilter] = useState(false);
  const d = new Date(month + "-01T12:00:00"),
    start = (d.getDay() + 6) % 7,
    days = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  const journal = data.journals?.find((j) => j.date === date),
    tasks = data.tasks.filter((t) => filter || t.date === date);
  const deadline = data.deadline
    ? Math.round(
        (Date.parse(data.deadline) - Date.parse(localDate())) / 86400000,
      )
    : null;
  function move(n: number) {
    setMonth(
      localDate(new Date(d.getFullYear(), d.getMonth() + n, 1)).slice(0, 7),
    );
  }
  function saveJournal(mood: string, text: string) {
    onChange({
      journals: [
        ...(data.journals || []).filter((j) => j.date !== date),
        { date, mood, text },
      ],
    });
  }
  return (
    <div className="schedule-workbench">
      <section className="welcome-card">
        <div>
          <span className="eyebrow">A LITTLE PROGRESS, EVERY DAY</span>
          <h2>把今天的灵感，慢慢拍成电影。</h2>
          <p>从一个场景、一帧画面开始。这里是你的个人创作日常。</p>
        </div>
        <div className="deadline-card">
          <label>
            电影项目
            <input
              aria-label="电影项目名称"
              placeholder="我的毕业短片"
              value={data.projectName || ""}
              onChange={(e) => onChange({ projectName: e.target.value })}
            />
          </label>
          <label>
            项目截止日期
            <input
              type="date"
              value={data.deadline || ""}
              onChange={(e) => onChange({ deadline: e.target.value })}
            />
          </label>
          <strong>
            {deadline === null
              ? "设置你的银幕之约"
              : deadline < 0
                ? `已过截止日 ${-deadline} 天`
                : deadline === 0
                  ? "今天是截止日"
                  : `距离完成还有 ${deadline} 天`}
          </strong>
        </div>
      </section>
      <div className="schedule-columns">
        <section className="panel month-calendar">
          <div className="section-intro">
            <h2>
              <CalendarDays size={18} /> 创作月历
            </h2>
            <div className="button-row">
              <button
                aria-label="上个月"
                className="icon-button"
                onClick={() => move(-1)}
              >
                <ChevronLeft size={18} />
              </button>
              <select
                className="calendar-year"
                aria-label="查看年份"
                value={month.slice(0, 4)}
                onChange={(e) => setMonth(e.target.value + month.slice(4))}
              >
                {Array.from(
                  new Set([
                    Number(month.slice(0, 4)),
                    ...Array.from(
                      { length: 11 },
                      (_, i) => new Date().getFullYear() - 5 + i,
                    ),
                  ]),
                )
                  .sort((a, b) => a - b)
                  .map((y) => (
                    <option key={y} value={String(y)}>
                      {y}年
                    </option>
                  ))}
              </select>
              <select
                className="calendar-month"
                aria-label="查看月份"
                value={month.slice(5)}
                onChange={(e) => setMonth(month.slice(0, 5) + e.target.value)}
              >
                {Array.from({ length: 12 }, (_, i) => (
                  <option key={i} value={String(i + 1).padStart(2, "0")}>
                    {i + 1}月
                  </option>
                ))}
              </select>
              <button
                aria-label="下个月"
                className="icon-button"
                onClick={() => move(1)}
              >
                <ChevronRight size={18} />
              </button>
            </div>
          </div>
          <div className="calendar-grid">
            {["一", "二", "三", "四", "五", "六", "日"].map((x) => (
              <span className="weekday" key={x}>
                {x}
              </span>
            ))}
            {Array.from({ length: start }, (_, i) => (
              <span key={"empty" + i} />
            ))}
            {Array.from({ length: days }, (_, i) => {
              const day = `${month}-${String(i + 1).padStart(2, "0")}`,
                count = data.tasks.filter((t) => t.date === day).length;
              return (
                <button
                  key={day}
                  aria-label={`选择 ${day}`}
                  aria-pressed={date === day}
                  className={`calendar-day ${date === day ? "selected" : ""} ${day === localDate() ? "today" : ""}`}
                  onClick={() => setDate(day)}
                >
                  <b>{i + 1}</b>
                  <span>
                    {data.journals
                      ?.find((j) => j.date === day)
                      ?.mood.split(" ")[0] || ""}
                  </span>
                  {count > 0 && <small>{count} 项</small>}
                </button>
              );
            })}
          </div>
          <p className="help">
            选择日期查看任务与日记 · {data.tasks.filter((t) => t.done).length} /{" "}
            {data.tasks.length} 项任务已完成
          </p>
        </section>
        <section className="panel mood-panel">
          <span className="eyebrow">A NOTE TO MYSELF</span>
          <h2>今日心情</h2>
          <label>
            日记日期
            <input
              aria-label="日记日期"
              type="date"
              value={date}
              onChange={(e) => {
                if (e.target.value) {
                  setDate(e.target.value);
                  setMonth(e.target.value.slice(0, 7));
                }
              }}
            />
          </label>
          <div className="mood-options">
            {moods.map((m) => (
              <button
                title={m}
                aria-label={m}
                aria-pressed={journal?.mood === m}
                className={journal?.mood === m ? "selected" : ""}
                key={m}
                onClick={() => saveJournal(m, journal?.text || "")}
              >
                {m.split(" ")[0]}
                <small>{m.split(" ")[1]}</small>
              </button>
            ))}
          </div>
          <label>
            创作日记
            <textarea
              aria-label="创作日记"
              rows={6}
              value={journal?.text || ""}
              placeholder="今天的灵感、困难与小小收获……"
              onChange={(e) =>
                saveJournal(journal?.mood || moods[2], e.target.value)
              }
            />
          </label>
          <p className="help">
            私人记录 · 仅存本地及你的 JSON 备份，不推送云端，不做情绪分析。
          </p>
        </section>
      </div>
      <TimerPanel
        data={data}
        scope={scope}
        date={date}
        onChange={onChange}
        tell={tell}
      />
      <section className="panel">
        <div className="section-intro">
          <h2>{filter ? "全部任务与历史记录" : date + " · 每日任务"}</h2>
          <div className="button-row">
            <button className="secondary" onClick={() => setFilter(!filter)}>
              {filter ? "仅看所选日期" : "查看全部历史"}
            </button>
            <button
              className="primary"
              data-new-task
              onClick={() => setTask(blankTask(date))}
            >
              <Plus size={16} />
              添加任务
            </button>
          </div>
        </div>
        <div className="schedule-task-list">
          {tasks.length === 0 && (
            <p className="empty">
              今天留一点空间，做一件让作品更进一步的小事。
            </p>
          )}
          {[...tasks]
            .sort((a, b) =>
              (a.date + (a.time || "")).localeCompare(b.date + (b.time || "")),
            )
            .map((t) => (
              <article
                className={`schedule-task ${t.done ? "done" : ""}`}
                key={t.id}
              >
                <input
                  type="checkbox"
                  aria-label={`完成 ${t.title}`}
                  checked={t.done}
                  onChange={() =>
                    onChange({
                      tasks: data.tasks.map((x) =>
                        x.id === t.id
                          ? {
                              ...x,
                              done: !x.done,
                              status: !x.done ? "已完成" : "待开始",
                            }
                          : x,
                      ),
                    })
                  }
                />
                <div>
                  <strong>{t.title}</strong>
                  <small>
                    {t.date} {t.time} · {t.category || "制作"} ·{" "}
                    {t.location || "地点未填写"} ·{" "}
                    {t.status || (t.done ? "已完成" : "待开始")} · {t.priority}
                    优先级
                  </small>
                  {t.notes && <p>{t.notes}</p>}
                </div>
                <button
                  className="icon-button"
                  aria-label={`编辑任务 ${t.title}`}
                  onClick={() => setTask({ ...t })}
                >
                  <Pencil size={16} />
                </button>
              </article>
            ))}
        </div>
        {task && (
          <form
            className="inline-editor"
            onSubmit={(e) => {
              e.preventDefault();
              if (!task.title.trim() || !task.date) return;
              onChange({
                tasks: data.tasks.some((t) => t.id === task.id)
                  ? data.tasks.map((t) => (t.id === task.id ? task : t))
                  : [...data.tasks, task],
              });
              setTask(null);
              tell("任务已保存");
            }}
          >
            <h3>编辑日程任务</h3>
            <div className="form-grid">
              <label>
                任务名称
                <input
                  id="task-title"
                  required
                  value={task.title}
                  onChange={(e) => setTask({ ...task, title: e.target.value })}
                />
              </label>
              <label>
                任务日期
                <input
                  type="date"
                  required
                  value={task.date}
                  onChange={(e) => setTask({ ...task, date: e.target.value })}
                />
              </label>
              <label>
                任务时间
                <input
                  type="time"
                  value={task.time || ""}
                  onChange={(e) => setTask({ ...task, time: e.target.value })}
                />
              </label>
              <label>
                学习或制作地点
                <input
                  value={task.location || ""}
                  onChange={(e) =>
                    setTask({ ...task, location: e.target.value })
                  }
                />
              </label>
              <label>
                任务类别
                <select
                  value={task.category || categories[0]}
                  onChange={(e) =>
                    setTask({ ...task, category: e.target.value })
                  }
                >
                  {categories.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </label>
              <label>
                任务状态
                <select
                  value={task.status || (task.done ? "已完成" : "待开始")}
                  onChange={(e) =>
                    setTask({
                      ...task,
                      status: e.target.value,
                      done: e.target.value === "已完成",
                    })
                  }
                >
                  {["待开始", "进行中", "已完成", "暂缓"].map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </label>
              <label>
                优先级
                <select
                  value={task.priority}
                  onChange={(e) =>
                    setTask({ ...task, priority: e.target.value })
                  }
                >
                  {["高", "中", "低"].map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </label>
            </div>
            <label>
              任务备注
              <textarea
                value={task.notes || ""}
                onChange={(e) => setTask({ ...task, notes: e.target.value })}
              />
            </label>
            <div className="button-row">
              <button className="primary">保存任务</button>
              <button
                type="button"
                className="secondary"
                onClick={() => setTask(null)}
              >
                取消
              </button>
            </div>
          </form>
        )}
      </section>
    </div>
  );
}
function TimerPanel({
  data,
  scope,
  date,
  onChange,
  tell,
}: {
  data: Studio;
  scope: string;
  date: string;
  onChange: (s: Partial<Studio>) => void;
  tell: (s: string) => void;
}) {
  const [ledger, setLedger] = useState<TimerLedger>(
      data.timer || { entries: [] },
    ),
    [now, setNow] = useState(Date.now()),
    [title, setTitle] = useState(""),
    [category, setCategory] = useState(categories[1]),
    [notes, setNotes] = useState(""),
    [manual, setManual] = useState<TimeEntry | null>(null),
    [minutes, setMinutes] = useState("30"),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    const read = () => {
      try {
        setLedger(readTimer(scope, data.timer || { entries: [] }));
      } catch (e) {
        tell((e as Error).message);
      }
    };
    read();
    window.addEventListener("storage", read);
    window.addEventListener("framework-timer", read);
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      clearInterval(t);
      window.removeEventListener("storage", read);
      window.removeEventListener("framework-timer", read);
    };
  }, [scope]);
  useEffect(() => {
    if (!busy) return;
    const guard = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [busy]);
  async function change(fn: (l: TimerLedger) => TimerLedger) {
    setBusy(true);
    try {
      const next = await changeTimer(scope, ledger, fn);
      setLedger(next);
      onChange({ timer: next });
      return true;
    } catch (e) {
      tell((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }
  const monday = new Date();
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  const week = localDate(monday);
  const current = ledger.active,
    today = localDate(),
    total = (start: string, end: string) =>
      ledger.entries
        .filter((e) => e.date >= start && e.date <= end)
        .reduce((s, e) => s + e.durationMs, 0) +
      (current && current.date >= start && current.date <= end
        ? elapsed(current, now)
        : 0);
  return (
    <section className="panel timer-panel">
      <div className="section-intro">
        <div>
          <span className="eyebrow">FOCUS ON YOUR FILM</span>
          <h2>
            <Clock3 size={18} /> AI 创作计时器
          </h2>
        </div>
        <div className="time-totals">
          <span>
            今日<strong>{timeText(total(today, today))}</strong>
          </span>
          <span>
            本周<strong>{timeText(total(week, today))}</strong>
          </span>
        </div>
      </div>
      <div className="timer-body">
        <div className="timer-digits" aria-label="当前计时">
          {timeText(current ? elapsed(current, now) : 0)}
          <small>
            {current
              ? `${current.title} · ${current.runningSince === null ? "已暂停" : "计时中"}`
              : "主动开始，才记录你的制作时间"}
          </small>
        </div>
        <div className="timer-controls">
          {!current ? (
            <>
              <label>
                计时任务名称
                <input
                  value={title}
                  list="timer-task-names"
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="例如：制作主角参考图"
                />
              </label>
              <datalist id="timer-task-names">
                {data.tasks.map((t) => (
                  <option key={t.id} value={t.title} />
                ))}
              </datalist>
              <label>
                制作类别
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                >
                  {categories.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </label>
              <label>
                计时备注
                <input
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </label>
              <button
                className="primary"
                disabled={busy || !title.trim()}
                onClick={() =>
                  void change((l) =>
                    timerAction(l, "start", {
                      id: uid(),
                      title,
                      date,
                      category,
                      notes,
                    }),
                  )
                }
              >
                <Play size={15} />
                开始计时
              </button>
            </>
          ) : (
            <>
              <p>
                {current.date} · {current.category} · {current.notes}
              </p>
              <div className="button-row">
                <button
                  className="secondary"
                  disabled={busy}
                  onClick={() =>
                    void change((l) =>
                      timerAction(
                        l,
                        current.runningSince === null ? "resume" : "pause",
                      ),
                    )
                  }
                >
                  {current.runningSince === null ? (
                    <Play size={15} />
                  ) : (
                    <Pause size={15} />
                  )}{" "}
                  {current.runningSince === null ? "继续计时" : "暂停计时"}
                </button>
                <button
                  className="primary"
                  disabled={busy}
                  onClick={() => void change((l) => timerAction(l, "finish"))}
                >
                  <Square size={15} />
                  结束并保存
                </button>
              </div>
            </>
          )}
        </div>
      </div>
      {busy && (
        <p role="status" className="help">
          正在保存计时，请稍候…
        </p>
      )}
      <p className="help">
        切换网站、后台标签页或刷新均按真实时间戳恢复。关闭浏览器期间，未暂停的任务仍继续计时；可结束后修改实际用时。相同浏览器多个标签页共享一个计时任务，各设备计时独立。
      </p>
      <div className="section-intro">
        <h3>工时记录</h3>
        <button
          className="secondary"
          onClick={() => {
            setManual({
              id: uid(),
              title: "",
              date,
              category: categories[1],
              notes: "",
              durationMs: 1800000,
            });
            setMinutes("30");
          }}
        >
          手动补录
        </button>
      </div>
      {ledger.entries.length === 0 && (
        <p className="help">尚无制作工时，从今天的第一个任务开始。</p>
      )}
      {[...ledger.entries].reverse().map((e) => (
        <div className="time-entry" key={e.id}>
          <span>
            <strong>{e.title}</strong>
            <small>
              {e.date} · {e.category} · {e.notes}
            </small>
          </span>
          <b>{timeText(e.durationMs)}</b>
          <button
            className="text-button"
            onClick={() => {
              setManual({ ...e });
              setMinutes(String(e.durationMs / 60000));
            }}
          >
            修改工时
          </button>
        </div>
      ))}
      {manual && (
        <form
          className="inline-editor"
          onSubmit={(e) => {
            e.preventDefault();
            const n = Number(minutes);
            if (
              !manual.title.trim() ||
              !Number.isFinite(n) ||
              n < 0 ||
              n > 525600
            )
              return tell("请填写有效任务与分钟数");
            void change((l) => ({
              ...l,
              entries: l.entries.some((t) => t.id === manual.id)
                ? l.entries.map((t) =>
                    t.id === manual.id
                      ? { ...manual, durationMs: Math.round(n * 60000) }
                      : t,
                  )
                : [
                    ...l.entries,
                    { ...manual, durationMs: Math.round(n * 60000) },
                  ],
            })).then((saved) => {
              if (saved) setManual(null);
            });
          }}
        >
          <div className="form-grid">
            <label>
              工时任务名称
              <input
                required
                value={manual.title}
                onChange={(e) =>
                  setManual({ ...manual, title: e.target.value })
                }
              />
            </label>
            <label>
              工时日期
              <input
                type="date"
                required
                value={manual.date}
                onChange={(e) => setManual({ ...manual, date: e.target.value })}
              />
            </label>
            <label>
              实际用时（分钟）
              <input
                type="number"
                min="0"
                max="525600"
                step="any"
                required
                value={minutes}
                onChange={(e) => setMinutes(e.target.value)}
              />
            </label>
            <label>
              工时类别
              <select
                value={manual.category}
                onChange={(e) =>
                  setManual({ ...manual, category: e.target.value })
                }
              >
                {categories.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </label>
          </div>
          <label>
            工时备注
            <textarea
              value={manual.notes}
              onChange={(e) => setManual({ ...manual, notes: e.target.value })}
            />
          </label>
          <div className="button-row">
            <button disabled={busy} className="primary">
              保存工时
            </button>
            <button
              type="button"
              className="secondary"
              onClick={() => setManual(null)}
            >
              取消
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
