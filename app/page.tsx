"use client";

import {
  ArrowUpRight,
  BriefcaseBusiness,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  CircleHelp,
  ExternalLink,
  FilterX,
  MapPin,
  Search,
  ShieldCheck,
  SlidersHorizontal,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import applicationsData from "../data/applications.json";
import jobsData from "../data/jobs.json";
import sourceState from "../data/source-state.json";

type SortKey = "priority" | "newest" | "fit";
type ViewKey = "jobs" | "applications";
type ApplicationStatus = "applying" | "needs-review" | "submitted" | "paused";
type ApplicationRecord = {
  id: string;
  company: string;
  role?: string | null;
  status: ApplicationStatus;
};

const tierOrder: Record<string, number> = {
  priority: 0,
  recommended: 1,
  watch: 2,
};

const tierLabel: Record<string, string> = {
  priority: "优先申请",
  recommended: "建议申请",
  watch: "观察",
};

const timingLabel: Record<string, string> = {
  "confirmed-2027": "2027 已确认",
  "timing-check": "入职时间待核实",
};

const sponsorshipLabel: Record<string, string> = {
  confirmed: "支持 Sponsorship",
  "opt-accepted": "接受 OPT",
  unknown: "Sponsorship 未说明",
};

const directionLabel: Record<string, string> = {
  Quant: "Quant",
  "AI/ML": "AI / ML",
  "ML Systems": "ML Systems",
  "SWE/Data Infra": "SWE / Data Infra",
};

const applicationStatusLabel: Record<string, string> = {
  applying: "申请中",
  "needs-review": "待检查",
  submitted: "已提交",
  paused: "暂停",
};

function mergeApplications(
  base: ApplicationRecord[],
  updates: ApplicationRecord[],
) {
  const merged = new Map(base.map((application) => [application.id, application]));
  updates.forEach((application) => merged.set(application.id, application));
  return [...merged.values()];
}

function formatScanTime(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Los_Angeles",
  }).format(new Date(value));
}

export default function Home() {
  const [view, setView] = useState<ViewKey>("jobs");
  const [query, setQuery] = useState("");
  const [tier, setTier] = useState("all");
  const [direction, setDirection] = useState("all");
  const [sponsorship, setSponsorship] = useState("all");
  const [timing, setTiming] = useState("all");
  const [sortBy, setSortBy] = useState<SortKey>("priority");
  const [selectedId, setSelectedId] = useState(jobsData[0]?.id ?? "");
  const [applications, setApplications] = useState<ApplicationRecord[]>(
    applicationsData.applications as ApplicationRecord[],
  );
  const [savingApplicationId, setSavingApplicationId] = useState("");
  const [statusError, setStatusError] = useState("");

  useEffect(() => {
    let active = true;

    fetch("/api/applications")
      .then(async (response) => {
        if (!response.ok) throw new Error("Unable to load application statuses");
        return (await response.json()) as { applications: ApplicationRecord[] };
      })
      .then((payload) => {
        if (active) {
          setApplications((current) => mergeApplications(current, payload.applications));
        }
      })
      .catch(() => {
        // The deployment-bundled record remains available if remote storage is offline.
      });

    return () => {
      active = false;
    };
  }, []);

  const applicationsById = useMemo(
    () => new Map(applications.map((application) => [application.id, application])),
    [applications],
  );
  const availableJobs = useMemo(
    () =>
      jobsData.filter(
        (job) => applicationsById.get(job.id)?.status !== "submitted",
      ),
    [applicationsById],
  );
  const filteredJobs = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return availableJobs
      .filter((job) => {
        const searchable = [
          job.company,
          job.role,
          job.location,
          job.resumeTrack,
          ...job.directions,
        ]
          .join(" ")
          .toLowerCase();
        return (
          (!normalizedQuery || searchable.includes(normalizedQuery)) &&
          (tier === "all" || job.fitTier === tier) &&
          (direction === "all" || job.directions.includes(direction)) &&
          (sponsorship === "all" || job.sponsorship === sponsorship) &&
          (timing === "all" || job.startTiming === timing)
        );
      })
      .sort((a, b) => {
        if (sortBy === "newest") {
          return (a.ageDays ?? 999) - (b.ageDays ?? 999) || b.fitScore - a.fitScore;
        }
        if (sortBy === "fit") {
          return b.fitScore - a.fitScore || (a.ageDays ?? 999) - (b.ageDays ?? 999);
        }
        return (
          Number(b.startTiming === "confirmed-2027") -
            Number(a.startTiming === "confirmed-2027") ||
          tierOrder[a.fitTier] - tierOrder[b.fitTier] ||
          (a.ageDays ?? 999) - (b.ageDays ?? 999) ||
          b.fitScore - a.fitScore
        );
      });
  }, [availableJobs, query, tier, direction, sponsorship, timing, sortBy]);

  const selectedJob =
    availableJobs.find((job) => job.id === selectedId) ??
    filteredJobs[0] ??
    availableJobs[0];
  const confirmedCount = availableJobs.filter(
    (job) => job.startTiming === "confirmed-2027",
  ).length;
  const priorityCount = availableJobs.filter(
    (job) => job.fitTier === "priority",
  ).length;
  const activeFilters = [tier, direction, sponsorship, timing].filter(
    (value) => value !== "all",
  ).length;

  function resetFilters() {
    setQuery("");
    setTier("all");
    setDirection("all");
    setSponsorship("all");
    setTiming("all");
  }

  async function markSubmitted(job: (typeof jobsData)[number]) {
    setSavingApplicationId(job.id);
    setStatusError("");

    try {
      const response = await fetch("/api/applications", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jobId: job.id, status: "submitted" }),
      });
      const payload = (await response.json()) as {
        application?: ApplicationRecord;
        error?: string;
      };
      if (!response.ok || !payload.application) {
        throw new Error(payload.error ?? "Unable to save application status");
      }
      setApplications((current) => mergeApplications(current, [payload.application!]));
    } catch {
      setStatusError("保存失败，请稍后重试；现有记录没有改变。");
    } finally {
      setSavingApplicationId("");
    }
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark" aria-hidden="true">
            <BriefcaseBusiness size={18} />
          </div>
          <div>
            <h1>2027 Job Radar</h1>
            <p>美国 New Grad 全职岗位</p>
          </div>
        </div>
        <div className="scan-meta">
          <span className="status-dot" aria-hidden="true" />
          <span>上次扫描 {formatScanTime(sourceState.lastSuccessfulScanAt)}</span>
          <a href={sourceState.sourceUrl} target="_blank" rel="noreferrer">
            SpeedyApply <ExternalLink size={13} />
          </a>
        </div>
      </header>

      <nav className="view-tabs" aria-label="站点视图">
        <button
          className={view === "jobs" ? "active" : ""}
          onClick={() => setView("jobs")}
          type="button"
        >
          岗位 <span>{availableJobs.length}</span>
        </button>
        <button
          className={view === "applications" ? "active" : ""}
          onClick={() => setView("applications")}
          type="button"
        >
          申请记录 <span>{applications.length}</span>
        </button>
      </nav>

      {view === "jobs" && (
        <>
          <section className="summary-strip" aria-label="岗位概览">
            <div>
              <strong>{availableJobs.length}</strong>
              <span>已筛选岗位</span>
            </div>
            <div>
              <strong>{confirmedCount}</strong>
              <span>2027 时间确认</span>
            </div>
            <div>
              <strong>{priorityCount}</strong>
              <span>优先申请</span>
            </div>
            <div className="freshness">
              <CalendarClock size={16} />
              <span>源数据状态：{sourceState.scanStatus === "complete" ? "已完成" : "待更新"}</span>
            </div>
          </section>

          <section className="controls" aria-label="筛选岗位">
            <label className="search-box">
              <Search size={17} aria-hidden="true" />
              <span className="sr-only">搜索岗位</span>
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="搜索公司、职位、地点或方向"
              />
            </label>
            <FilterSelect
              label="优先级"
              value={tier}
              onChange={setTier}
              options={[
                ["all", "全部优先级"],
                ["priority", "优先申请"],
                ["recommended", "建议申请"],
                ["watch", "观察"],
              ]}
            />
            <FilterSelect
              label="方向"
              value={direction}
              onChange={setDirection}
              options={[
                ["all", "全部方向"],
                ["Quant", "Quant"],
                ["AI/ML", "AI / ML"],
                ["ML Systems", "ML Systems"],
                ["SWE/Data Infra", "SWE / Data Infra"],
              ]}
            />
            <FilterSelect
              label="签证信息"
              value={sponsorship}
              onChange={setSponsorship}
              options={[
                ["all", "全部签证状态"],
                ["confirmed", "支持 Sponsorship"],
                ["opt-accepted", "接受 OPT"],
                ["unknown", "未说明"],
              ]}
            />
            <FilterSelect
              label="入职时间"
              value={timing}
              onChange={setTiming}
              options={[
                ["all", "全部入职状态"],
                ["confirmed-2027", "2027 已确认"],
                ["timing-check", "待核实"],
              ]}
            />
            <button className="reset-button" onClick={resetFilters} type="button">
              <FilterX size={16} />
              清除{activeFilters > 0 ? ` ${activeFilters}` : ""}
            </button>
          </section>

          <section className="legend" aria-label="状态说明">
            <span><CheckCircle2 size={14} />已确认：官方页面支持 2027 时间线</span>
            <span><CalendarClock size={14} />时间待核实：技术匹配，但开始日期未确认</span>
            <span><CircleHelp size={14} />签证未知：页面未说明，不代表不支持</span>
          </section>

          <div className="workspace">
        <section className="job-list" aria-label="岗位列表">
          <div className="list-toolbar">
            <span>显示 {filteredJobs.length} 个岗位</span>
            <label className="sort-control">
              <SlidersHorizontal size={15} />
              <span className="sr-only">排序方式</span>
              <select
                value={sortBy}
                onChange={(event) => setSortBy(event.target.value as SortKey)}
              >
                <option value="priority">推荐排序</option>
                <option value="newest">最新发布</option>
                <option value="fit">匹配度</option>
              </select>
              <ChevronDown size={14} aria-hidden="true" />
            </label>
          </div>

          <div className="rows">
            {filteredJobs.map((job) => (
              <button
                className={`job-row ${selectedJob?.id === job.id ? "selected" : ""}`}
                key={job.id}
                onClick={() => setSelectedId(job.id)}
                type="button"
              >
                <div className="company-cell">
                  <span className="company-logo">{job.company.slice(0, 1)}</span>
                  <div>
                    <strong>{job.company}</strong>
                    <span>{job.role}</span>
                  </div>
                </div>
                <div className="row-meta">
                  <span><MapPin size={13} />{job.location}</span>
                  <span>{job.ageDays === null ? "发布日期待同步" : `${job.ageDays}d`}</span>
                </div>
                <div className="row-badges">
                  <span className={`badge tier-${job.fitTier}`}>
                    {tierLabel[job.fitTier]}
                  </span>
                  <span className={`badge timing-${job.startTiming}`}>
                    {timingLabel[job.startTiming]}
                  </span>
                  <strong className="score">{job.fitScore}</strong>
                </div>
              </button>
            ))}
            {filteredJobs.length === 0 && (
              <div className="empty-state">
                <Search size={22} />
                <strong>没有匹配的岗位</strong>
                <span>减少筛选条件后再试一次。</span>
              </div>
            )}
          </div>
        </section>

        {selectedJob && (
          <aside className="detail-pane" aria-label="岗位详情">
            <div className="detail-heading">
              <div>
                <span className="eyebrow">{selectedJob.company}</span>
                <h2>{selectedJob.role}</h2>
                <p><MapPin size={14} />{selectedJob.location}</p>
              </div>
              <span className="fit-score">{selectedJob.fitScore}<small>/100</small></span>
            </div>

            <div className="detail-status">
              <span className={`badge tier-${selectedJob.fitTier}`}>
                {tierLabel[selectedJob.fitTier]}
              </span>
              <span className={`badge timing-${selectedJob.startTiming}`}>
                {timingLabel[selectedJob.startTiming]}
              </span>
              <span className={`badge sponsorship-${selectedJob.sponsorship}`}>
                {sponsorshipLabel[selectedJob.sponsorship]}
              </span>
            </div>

            <DetailSection title="适合你的原因">
              <ul>
                {selectedJob.reasons.map((reason) => <li key={reason}>{reason}</li>)}
              </ul>
            </DetailSection>

            <DetailSection title="需要注意">
              <ul className="caveats">
                {selectedJob.caveats.map((caveat) => <li key={caveat}>{caveat}</li>)}
              </ul>
            </DetailSection>

            <div className="detail-grid">
              <div>
                <span>简历方向</span>
                <strong>{selectedJob.resumeTrack}</strong>
              </div>
              <div>
                <span>岗位方向</span>
                <strong>{selectedJob.directions.map((item) => directionLabel[item]).join(" · ")}</strong>
              </div>
              <div>
                <span>资格判断</span>
                <strong>{selectedJob.eligibility === "eligible" ? "符合" : "大概率符合"}</strong>
              </div>
              <div>
                <span>最后核查</span>
                <strong>{selectedJob.lastCheckedAt.slice(0, 10)}</strong>
              </div>
            </div>

            <div className="apply-actions">
              <a className="apply-button" href={selectedJob.applyUrl} target="_blank" rel="noreferrer">
                查看官方岗位 <ArrowUpRight size={17} />
              </a>
              {"alternateApplyUrls" in selectedJob &&
                selectedJob.alternateApplyUrls?.map((item) => (
                  <a
                    className="alternate-link"
                    href={item.url}
                    key={item.url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {item.label} <ExternalLink size={13} />
                  </a>
                ))}
              <button
                className="status-button"
                disabled={savingApplicationId === selectedJob.id}
                onClick={() => markSubmitted(selectedJob)}
                type="button"
              >
                <CheckCircle2 size={16} />
                {savingApplicationId === selectedJob.id
                  ? "正在保存…"
                  : "标记为已提交"}
              </button>
            </div>

            {statusError && <p className="status-error" role="alert">{statusError}</p>}

            <p className="source-note">
              <ShieldCheck size={14} />
              仅保存公开岗位信息；申请前仍以公司官网为准。
            </p>
          </aside>
        )}
          </div>
        </>
      )}

      {view === "applications" && (
        <section className="applications-panel" aria-label="申请记录">
          <div className="applications-toolbar">
            <strong>申请记录</strong>
            <span>{applications.length} 个岗位</span>
          </div>
          {applications.length > 0 ? (
            <div className="application-rows">
              {applications.map((application) => (
                <div className="application-row" key={application.id}>
                  <div>
                    <strong>{application.company}</strong>
                    {application.role && <span>{application.role}</span>}
                  </div>
                  <span className={`application-status status-${application.status}`}>
                    {applicationStatusLabel[application.status] ?? application.status}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-state application-empty">
              <BriefcaseBusiness size={22} />
              <strong>还没有申请记录</strong>
              <span>开始申请后，这里只显示公司、岗位和当前状态。</span>
            </div>
          )}
        </section>
      )}
    </main>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: string[][];
}) {
  return (
    <label className="filter-select">
      <span className="sr-only">{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map(([optionValue, optionLabel]) => (
          <option key={optionValue} value={optionValue}>{optionLabel}</option>
        ))}
      </select>
      <ChevronDown size={14} aria-hidden="true" />
    </label>
  );
}

function DetailSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="detail-section">
      <h3>{title}</h3>
      {children}
    </section>
  );
}
