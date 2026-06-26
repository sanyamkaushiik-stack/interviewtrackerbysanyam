/*
  CareerTrack Pro
  A local-first career operations dashboard built with vanilla JavaScript.
  The app keeps all user data in LocalStorage and renders every view from one
  shared state object, which keeps the project portable for portfolio demos.
*/

const CareerTrackPro = (() => {
  // Storage and taxonomy constants define the app's local data contract.
  const STORAGE_KEY = "careertrack-pro-state-v1";

  const STATUSES = [
    { id: "Saved", label: "Saved", className: "saved", color: "#64748b" },
    { id: "Applied", label: "Applied", className: "applied", color: "#2563eb" },
    { id: "Screening", label: "Screening", className: "screening", color: "#0891b2" },
    { id: "Interview", label: "Interview", className: "interview", color: "#7c3aed" },
    { id: "Offer", label: "Offer", className: "offer", color: "#16a34a" },
    { id: "Rejected", label: "Rejected", className: "rejected", color: "#dc2626" }
  ];

  const PRIORITIES = ["High", "Medium", "Low"];
  const INTERVIEW_TYPES = ["Recruiter Screen", "Hiring Manager", "Technical", "Case Study", "Panel", "Final"];
  const INTERVIEW_STATUSES = ["Scheduled", "Completed", "Rescheduled", "Cancelled"];
  const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  // Runtime references are kept module-scoped so renderers can stay small.
  let state = null;
  let activeView = "dashboard";
  let calendarCursor = startOfMonth(new Date());
  let charts = {};
  let currentFormHandler = null;

  const els = {};

  // Boot the app, hydrate data, connect events, and render the first view.
  function init() {
    cacheElements();
    state = loadState();
    activeView = getInitialView();
    calendarCursor = startOfMonth(new Date());
    applyTheme();
    bindEvents();
    renderAll();
    switchView(activeView, { updateHash: false });
    toast("Workspace ready", "Sample data loaded and saved locally.", "success");
  }

  // Cache hot DOM references once to avoid repeated document queries.
  function cacheElements() {
    els.body = document.body;
    els.viewTitle = document.getElementById("viewTitle");
    els.globalSearch = document.getElementById("globalSearch");
    els.statusFilter = document.getElementById("statusFilter");
    els.companyFilter = document.getElementById("companyFilter");
    els.statsGrid = document.getElementById("statsGrid");
    els.dashboardPipeline = document.getElementById("dashboardPipeline");
    els.upcomingInterviews = document.getElementById("upcomingInterviews");
    els.followUpList = document.getElementById("followUpList");
    els.applicationsTable = document.getElementById("applicationsTable");
    els.kanbanBoard = document.getElementById("kanbanBoard");
    els.companyGrid = document.getElementById("companyGrid");
    els.interviewTimeline = document.getElementById("interviewTimeline");
    els.calendarGrid = document.getElementById("calendarGrid");
    els.calendarMonthLabel = document.getElementById("calendarMonthLabel");
    els.resumeGrid = document.getElementById("resumeGrid");
    els.skillList = document.getElementById("skillList");
    els.notesGrid = document.getElementById("notesGrid");
    els.modalBackdrop = document.getElementById("modalBackdrop");
    els.modalForm = document.getElementById("modalForm");
    els.modalTitle = document.getElementById("modalTitle");
    els.modalEyebrow = document.getElementById("modalEyebrow");
    els.toastRegion = document.getElementById("toastRegion");
    els.themeToggle = document.getElementById("themeToggle");
  }

  // Wire all global interactions, including delegated CRUD buttons.
  function bindEvents() {
    document.querySelectorAll("[data-view-link]").forEach((control) => {
      control.addEventListener("click", (event) => {
        event.preventDefault();
        switchView(control.dataset.viewLink);
      });
    });

    document.addEventListener("click", handleGlobalClick);
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !els.modalBackdrop.hidden) {
        closeModal();
      }
    });

    els.globalSearch.addEventListener("input", debounce(() => renderAll(), 120));
    els.statusFilter.addEventListener("change", renderApplications);
    els.companyFilter.addEventListener("change", renderApplications);
    els.themeToggle.addEventListener("click", toggleTheme);
    els.modalBackdrop.addEventListener("click", (event) => {
      if (event.target === els.modalBackdrop) {
        closeModal();
      }
    });

    els.modalForm.addEventListener("submit", (event) => {
      event.preventDefault();
      if (currentFormHandler) {
        currentFormHandler(new FormData(els.modalForm));
      }
    });

    document.getElementById("prevMonthBtn").addEventListener("click", () => {
      calendarCursor = addMonths(calendarCursor, -1);
      renderCalendar();
    });

    document.getElementById("nextMonthBtn").addEventListener("click", () => {
      calendarCursor = addMonths(calendarCursor, 1);
      renderCalendar();
    });

    document.getElementById("refreshChartsBtn").addEventListener("click", () => {
      renderCharts();
      toast("Charts refreshed", "Analytics now reflect the latest workspace data.", "success");
    });

    document.getElementById("exportCsvBtn").addEventListener("click", exportApplicationsCsv);
    document.getElementById("pdfReportBtn").addEventListener("click", generatePdfReport);
  }

  function handleGlobalClick(event) {
    const actionButton = event.target.closest("[data-action]");
    if (actionButton) {
      const action = actionButton.dataset.action;
      if (action === "open-application-modal") openApplicationModal();
      if (action === "open-company-modal") openCompanyModal();
      if (action === "open-interview-modal") openInterviewModal();
      if (action === "open-resume-modal") openResumeModal();
      if (action === "open-skill-modal") openSkillModal();
      if (action === "open-note-modal") openNoteModal();
      if (action === "close-modal") closeModal();
    }

    const rowAction = event.target.closest("[data-row-action]");
    if (rowAction) {
      handleRowAction(rowAction.dataset.rowAction, rowAction.dataset.id);
    }
  }

  function handleRowAction(action, id) {
    const handlers = {
      "edit-app": () => openApplicationModal(id),
      "delete-app": () => deleteApplication(id),
      "schedule-app": () => openInterviewModal(null, id),
      "note-app": () => openNoteModal(null, id),
      "edit-company": () => openCompanyModal(id),
      "delete-company": () => deleteCompany(id),
      "edit-interview": () => openInterviewModal(id),
      "complete-interview": () => updateInterviewStatus(id, "Completed"),
      "delete-interview": () => deleteInterview(id),
      "edit-resume": () => openResumeModal(id),
      "delete-resume": () => deleteResume(id),
      "edit-skill": () => openSkillModal(id),
      "delete-skill": () => deleteSkill(id),
      "delete-note": () => deleteNote(id),
      "edit-note": () => openNoteModal(id)
    };

    if (handlers[action]) {
      handlers[action]();
    }
  }

  // LocalStorage persistence keeps the app fully client-side and portable.
  function loadState() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        return JSON.parse(stored);
      }
    } catch (error) {
      console.warn("Unable to read saved CareerTrack Pro data.", error);
    }

    const seed = buildSeedData();
    saveState(seed);
    return seed;
  }

  function saveState(nextState = state) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(nextState));
    } catch (error) {
      console.warn("Unable to save CareerTrack Pro data.", error);
      toast("Save failed", "Your browser blocked LocalStorage for this page.", "danger");
    }
  }

  // First launch data is realistic enough to make the dashboard portfolio-ready.
  function buildSeedData() {
    const today = startOfDay(new Date());
    const companyIds = {
      nova: uid("company"),
      helio: uid("company"),
      atlas: uid("company"),
      bright: uid("company"),
      forge: uid("company"),
      northstar: uid("company")
    };

    const appIds = {
      nova: uid("app"),
      helio: uid("app"),
      atlas: uid("app"),
      bright: uid("app"),
      forge: uid("app"),
      northstar: uid("app"),
      lumen: uid("app"),
      orbit: uid("app")
    };

    return {
      settings: {
        theme: "light"
      },
      companies: [
        {
          id: companyIds.nova,
          name: "NovaPay",
          industry: "Fintech",
          size: "501-1000",
          location: "Austin, TX",
          website: "https://novapay.example",
          contact: "Maya Chen, Talent Partner",
          rating: 92,
          notes: "Strong product culture, high-impact payments platform, remote-friendly engineering team."
        },
        {
          id: companyIds.helio,
          name: "HelioCloud",
          industry: "Cloud Infrastructure",
          size: "1001-5000",
          location: "Seattle, WA",
          website: "https://heliocloud.example",
          contact: "Ravi Menon, Engineering Manager",
          rating: 88,
          notes: "Infrastructure team is scaling observability products for enterprise customers."
        },
        {
          id: companyIds.atlas,
          name: "AtlasWorks",
          industry: "B2B SaaS",
          size: "201-500",
          location: "New York, NY",
          website: "https://atlasworks.example",
          contact: "Laura Diaz, Recruiter",
          rating: 81,
          notes: "Design-forward team building workflow automation for operations leaders."
        },
        {
          id: companyIds.bright,
          name: "BrightPath Health",
          industry: "Healthtech",
          size: "501-1000",
          location: "Boston, MA",
          website: "https://brightpath.example",
          contact: "Ethan Brooks, Director of Product",
          rating: 78,
          notes: "Mission-driven healthcare analytics company with a senior product opening."
        },
        {
          id: companyIds.forge,
          name: "FinForge Labs",
          industry: "AI Finance",
          size: "51-200",
          location: "San Francisco, CA",
          website: "https://finforge.example",
          contact: "Sana Malik, Founder",
          rating: 84,
          notes: "Early-stage team. Fast loop, technical interviews expected to be systems-heavy."
        },
        {
          id: companyIds.northstar,
          name: "Northstar AI",
          industry: "AI Productivity",
          size: "201-500",
          location: "Remote",
          website: "https://northstarai.example",
          contact: "Olivia Stone, Recruiting Lead",
          rating: 90,
          notes: "Role aligns well with platform strategy and analytics experience."
        }
      ],
      applications: [
        {
          id: appIds.nova,
          role: "Senior Product Manager",
          companyId: companyIds.nova,
          location: "Austin, TX / Remote",
          type: "Full-time",
          salary: "$145k - $170k",
          status: "Interview",
          priority: "High",
          source: "Referral",
          appliedDate: iso(addDays(today, -18)),
          deadline: iso(addDays(today, 7)),
          contact: "Maya Chen",
          url: "https://novapay.example/careers/spm",
          nextStep: "Prepare product strategy presentation",
          skillsRequired: "Roadmapping, payments domain, executive storytelling",
          notes: "Strong match. Hiring manager asked for examples of pricing strategy and team influence."
        },
        {
          id: appIds.helio,
          role: "Platform Product Lead",
          companyId: companyIds.helio,
          location: "Seattle, WA",
          type: "Hybrid",
          salary: "$155k - $185k",
          status: "Screening",
          priority: "High",
          source: "LinkedIn",
          appliedDate: iso(addDays(today, -8)),
          deadline: iso(addDays(today, 11)),
          contact: "Ravi Menon",
          url: "https://heliocloud.example/jobs/platform-lead",
          nextStep: "Send metrics dashboard case study",
          skillsRequired: "Cloud platforms, observability, enterprise GTM",
          notes: "Recruiter screen went well. Need to sharpen cloud cost optimization examples."
        },
        {
          id: appIds.atlas,
          role: "Growth Product Manager",
          companyId: companyIds.atlas,
          location: "New York, NY",
          type: "Full-time",
          salary: "$132k - $158k",
          status: "Applied",
          priority: "Medium",
          source: "Company site",
          appliedDate: iso(addDays(today, -4)),
          deadline: iso(addDays(today, 14)),
          contact: "Laura Diaz",
          url: "https://atlasworks.example/careers/growth-pm",
          nextStep: "Follow up with recruiter",
          skillsRequired: "Experimentation, lifecycle analytics, SQL",
          notes: "Portfolio can highlight funnel redesign and activation improvements."
        },
        {
          id: appIds.bright,
          role: "Product Strategy Manager",
          companyId: companyIds.bright,
          location: "Boston, MA / Remote",
          type: "Remote",
          salary: "$125k - $150k",
          status: "Saved",
          priority: "Medium",
          source: "Wellfound",
          appliedDate: "",
          deadline: iso(addDays(today, 5)),
          contact: "Ethan Brooks",
          url: "https://brightpath.example/jobs/product-strategy",
          nextStep: "Tailor resume to healthcare analytics",
          skillsRequired: "Healthcare data, stakeholder research, HIPAA awareness",
          notes: "Needs industry-specific framing before applying."
        },
        {
          id: appIds.forge,
          role: "AI Product Manager",
          companyId: companyIds.forge,
          location: "San Francisco, CA",
          type: "Full-time",
          salary: "$150k - $190k + equity",
          status: "Offer",
          priority: "High",
          source: "Founder outreach",
          appliedDate: iso(addDays(today, -31)),
          deadline: iso(addDays(today, 3)),
          contact: "Sana Malik",
          url: "https://finforge.example/careers/ai-pm",
          nextStep: "Compare offer with NovaPay process",
          skillsRequired: "AI roadmap, fintech risk, model evaluation",
          notes: "Offer includes meaningful equity. Need to ask about runway and reporting line."
        },
        {
          id: appIds.northstar,
          role: "Principal Product Manager",
          companyId: companyIds.northstar,
          location: "Remote",
          type: "Remote",
          salary: "$165k - $210k",
          status: "Interview",
          priority: "High",
          source: "Conference connection",
          appliedDate: iso(addDays(today, -13)),
          deadline: iso(addDays(today, 9)),
          contact: "Olivia Stone",
          url: "https://northstarai.example/jobs/principal-pm",
          nextStep: "Complete take-home review memo",
          skillsRequired: "AI UX, enterprise workflows, metrics design",
          notes: "Most strategic fit. Prepare examples of ambiguous product discovery."
        },
        {
          id: appIds.lumen,
          role: "Product Operations Lead",
          companyId: companyIds.atlas,
          location: "Remote",
          type: "Contract-to-hire",
          salary: "$110k - $130k",
          status: "Rejected",
          priority: "Low",
          source: "AngelList",
          appliedDate: iso(addDays(today, -38)),
          deadline: "",
          contact: "Laura Diaz",
          url: "",
          nextStep: "Archive learnings",
          skillsRequired: "Product ops, enablement, rollout planning",
          notes: "Rejected after screen due to mismatch on IC vs leadership scope."
        },
        {
          id: appIds.orbit,
          role: "Director of Product Analytics",
          companyId: companyIds.helio,
          location: "Denver, CO",
          type: "Full-time",
          salary: "$170k - $205k",
          status: "Applied",
          priority: "Medium",
          source: "Recruiter",
          appliedDate: iso(addDays(today, -2)),
          deadline: iso(addDays(today, 18)),
          contact: "Ravi Menon",
          url: "",
          nextStep: "Wait for recruiter feedback",
          skillsRequired: "Analytics strategy, data leadership, experimentation",
          notes: "Potential stretch title. Use analytics dashboard case study."
        }
      ],
      interviews: [
        {
          id: uid("interview"),
          applicationId: appIds.nova,
          companyId: companyIds.nova,
          title: "Product Strategy Panel",
          type: "Panel",
          date: iso(addDays(today, 2)),
          time: "10:30",
          interviewer: "Maya Chen, VP Product, Design Lead",
          location: "Zoom",
          status: "Scheduled",
          notes: "Bring 10-minute narrative on payments roadmap tradeoffs."
        },
        {
          id: uid("interview"),
          applicationId: appIds.northstar,
          companyId: companyIds.northstar,
          title: "Technical Product Deep Dive",
          type: "Technical",
          date: iso(addDays(today, 6)),
          time: "15:00",
          interviewer: "Olivia Stone and Platform Engineering",
          location: "Google Meet",
          status: "Scheduled",
          notes: "Review AI workflow reliability and adoption metrics."
        },
        {
          id: uid("interview"),
          applicationId: appIds.helio,
          companyId: companyIds.helio,
          title: "Recruiter Screen",
          type: "Recruiter Screen",
          date: iso(addDays(today, -1)),
          time: "11:00",
          interviewer: "Ravi Menon",
          location: "Phone",
          status: "Completed",
          notes: "Discussed team scope, comp range, and next-step case study."
        }
      ],
      resumes: [
        {
          id: uid("resume"),
          name: "Product Leadership Resume",
          version: "v4.2",
          targetRole: "Principal PM / Product Lead",
          fileName: "Product_Leadership_Resume_v4.2.pdf",
          updatedDate: iso(addDays(today, -3)),
          changes: "Added AI roadmap examples, tightened leadership summary, moved metrics above fold.",
          active: true
        },
        {
          id: uid("resume"),
          name: "Fintech Focus Resume",
          version: "v2.1",
          targetRole: "Fintech Product Manager",
          fileName: "Fintech_PM_Resume_v2.1.pdf",
          updatedDate: iso(addDays(today, -10)),
          changes: "Expanded payments launch story and regulatory collaboration details.",
          active: false
        },
        {
          id: uid("resume"),
          name: "Analytics Leadership Resume",
          version: "v1.8",
          targetRole: "Director of Product Analytics",
          fileName: "Analytics_Product_Resume_v1.8.pdf",
          updatedDate: iso(addDays(today, -6)),
          changes: "Featured experimentation platform and dashboard adoption metrics.",
          active: false
        }
      ],
      notes: [
        {
          id: uid("note"),
          applicationId: appIds.nova,
          title: "NovaPay panel prep",
          category: "Interview Prep",
          date: iso(addDays(today, -1)),
          body: "Open with the merchant activation story. Emphasize how the team used support signals, checkout data, and partner feedback to prioritize roadmap bets."
        },
        {
          id: uid("note"),
          applicationId: appIds.helio,
          title: "HelioCloud screen recap",
          category: "Interview Notes",
          date: iso(addDays(today, -1)),
          body: "Recruiter responded well to observability example. Next round likely probes enterprise prioritization and roadmap communication."
        },
        {
          id: uid("note"),
          applicationId: appIds.forge,
          title: "Offer questions",
          category: "Decision Log",
          date: iso(addDays(today, 0)),
          body: "Ask about runway, equity refresh policy, product analytics maturity, and how model risk decisions are made."
        }
      ],
      skills: [
        {
          id: uid("skill"),
          name: "Cloud cost optimization",
          category: "Domain",
          current: 62,
          target: 85,
          priority: "High",
          resources: "Review AWS cost case study and build one STAR story."
        },
        {
          id: uid("skill"),
          name: "AI evaluation metrics",
          category: "Technical Product",
          current: 70,
          target: 90,
          priority: "High",
          resources: "Summarize precision, recall, hallucination rate, and human review workflows."
        },
        {
          id: uid("skill"),
          name: "Healthcare analytics",
          category: "Industry",
          current: 45,
          target: 75,
          priority: "Medium",
          resources: "Map product examples to patient outcomes, privacy, and payer/provider workflows."
        },
        {
          id: uid("skill"),
          name: "Executive storytelling",
          category: "Communication",
          current: 78,
          target: 92,
          priority: "Medium",
          resources: "Practice 3-minute versions of strategy, conflict, and launch impact stories."
        }
      ]
    };
  }

  // Renderers derive every view from the same state object.
  function renderAll() {
    renderFilters();
    renderStats();
    renderDashboardPipeline();
    renderUpcomingInterviews();
    renderFollowUps();
    renderApplications();
    renderKanban();
    renderCompanies();
    renderInterviews();
    renderCalendar();
    renderResumes();
    renderSkills();
    renderNotes();
    if (activeView === "analytics") {
      renderCharts();
    }
  }

  // Dashboard and application views.
  function switchView(viewName, options = { updateHash: true }) {
    if (!document.querySelector(`[data-view="${viewName}"]`)) {
      viewName = "dashboard";
    }

    activeView = viewName;
    document.querySelectorAll(".view").forEach((view) => {
      view.classList.toggle("is-active", view.dataset.view === viewName);
    });
    document.querySelectorAll("[data-view-link]").forEach((control) => {
      control.classList.toggle("is-active", control.dataset.viewLink === viewName);
    });

    const title = titleCase(viewName === "kanban" ? "Pipeline" : viewName);
    els.viewTitle.textContent = title;
    document.title = `${title} | CareerTrack Pro`;

    if (options.updateHash) {
      history.replaceState(null, "", `#${viewName}`);
    }

    if (viewName === "analytics") {
      requestAnimationFrame(renderCharts);
    }
  }

  function renderFilters() {
    const currentStatus = els.statusFilter.value || "All";
    const currentCompany = els.companyFilter.value || "All";

    els.statusFilter.innerHTML = [
      `<option value="All">All statuses</option>`,
      ...STATUSES.map((status) => `<option value="${status.id}">${status.label}</option>`)
    ].join("");
    els.statusFilter.value = STATUSES.some((status) => status.id === currentStatus) ? currentStatus : "All";

    els.companyFilter.innerHTML = [
      `<option value="All">All companies</option>`,
      ...state.companies
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((company) => `<option value="${company.id}">${escapeHtml(company.name)}</option>`)
    ].join("");
    els.companyFilter.value = state.companies.some((company) => company.id === currentCompany) ? currentCompany : "All";
  }

  function renderStats() {
    const total = state.applications.length;
    const active = state.applications.filter((app) => !["Rejected", "Offer"].includes(app.status)).length;
    const offers = state.applications.filter((app) => app.status === "Offer").length;
    const upcoming = getUpcomingInterviews(14).length;
    const responsePool = state.applications.filter((app) => app.status !== "Saved");
    const responses = responsePool.filter((app) => ["Screening", "Interview", "Offer", "Rejected"].includes(app.status)).length;
    const responseRate = responsePool.length ? Math.round((responses / responsePool.length) * 100) : 0;

    const cards = [
      {
        label: "Total Applications",
        value: total,
        helper: `${active} active opportunities`,
        color: "var(--primary)",
        bg: "var(--primary-soft)"
      },
      {
        label: "Upcoming Interviews",
        value: upcoming,
        helper: "Next 14 days",
        color: "var(--violet)",
        bg: "var(--violet-soft)"
      },
      {
        label: "Offer Count",
        value: offers,
        helper: "Negotiation-ready",
        color: "var(--success)",
        bg: "var(--success-soft)"
      },
      {
        label: "Response Rate",
        value: `${responseRate}%`,
        helper: "Applications beyond sent",
        color: "var(--warning)",
        bg: "var(--warning-soft)"
      }
    ];

    els.statsGrid.innerHTML = cards.map((card) => `
      <article class="stat-card" style="--stat-color:${card.color};--stat-bg:${card.bg}">
        <span>${card.label}</span>
        <strong>${card.value}</strong>
        <small>${card.helper}</small>
      </article>
    `).join("");
  }

  function renderDashboardPipeline() {
    const counts = getStatusCounts();
    const max = Math.max(1, ...Object.values(counts));
    els.dashboardPipeline.innerHTML = STATUSES.map((status) => {
      const count = counts[status.id] || 0;
      const width = Math.max(6, Math.round((count / max) * 100));
      return `
        <div class="stage-row">
          <strong>${status.label}</strong>
          <div class="stage-track" aria-hidden="true">
            <span style="width:${width}%;--stage-color:${status.color}"></span>
          </div>
          <span class="muted">${count}</span>
        </div>
      `;
    }).join("");
  }

  function renderUpcomingInterviews() {
    const interviews = getUpcomingInterviews(21).slice(0, 4);
    if (!interviews.length) {
      els.upcomingInterviews.innerHTML = `<div class="empty-state">No upcoming interviews scheduled.</div>`;
      return;
    }

    els.upcomingInterviews.innerHTML = interviews.map((interview) => {
      const app = getApplication(interview.applicationId);
      const company = getCompany(interview.companyId);
      return `
        <div class="stack-item">
          <strong>${escapeHtml(interview.title)}</strong>
          <div class="item-meta">
            <span>${escapeHtml(company?.name || "Unknown company")}</span>
            <span>${formatDate(interview.date)} at ${escapeHtml(interview.time)}</span>
            <span>${escapeHtml(app?.role || "Application")}</span>
          </div>
        </div>
      `;
    }).join("");
  }

  function renderFollowUps() {
    const followUps = state.applications
      .filter((app) => app.deadline && !["Rejected", "Offer"].includes(app.status))
      .sort((a, b) => new Date(a.deadline) - new Date(b.deadline))
      .slice(0, 4);

    if (!followUps.length) {
      els.followUpList.innerHTML = `<div class="empty-state">No follow-ups need attention.</div>`;
      return;
    }

    els.followUpList.innerHTML = followUps.map((app) => {
      const company = getCompany(app.companyId);
      return `
        <div class="stack-item">
          <strong>${escapeHtml(app.nextStep || "Follow up")}</strong>
          <div class="item-meta">
            <span>${escapeHtml(app.role)}</span>
            <span>${escapeHtml(company?.name || "Unknown company")}</span>
            <span>${relativeDate(app.deadline)}</span>
          </div>
        </div>
      `;
    }).join("");
  }

  function renderApplications() {
    const applications = getFilteredApplications();

    if (!applications.length) {
      els.applicationsTable.innerHTML = `
        <tr>
          <td colspan="7">
            <div class="empty-state">No applications match the current search and filters.</div>
          </td>
        </tr>
      `;
      return;
    }

    els.applicationsTable.innerHTML = applications.map((app) => {
      const company = getCompany(app.companyId);
      const status = getStatusMeta(app.status);
      return `
        <tr>
          <td>
            <div class="cell-title">
              <strong>${escapeHtml(app.role)}</strong>
              <span class="muted">${escapeHtml(app.location || "Location not set")}</span>
            </div>
          </td>
          <td>${escapeHtml(company?.name || "Unknown company")}</td>
          <td><span class="badge ${status.className}">${status.label}</span></td>
          <td><span class="badge priority-${app.priority.toLowerCase()}">${escapeHtml(app.priority)}</span></td>
          <td>${app.appliedDate ? formatDate(app.appliedDate) : "Not applied"}</td>
          <td>${escapeHtml(app.nextStep || "Add next step")}</td>
          <td>
            <div class="row-actions">
              <button class="small-action" type="button" data-row-action="edit-app" data-id="${app.id}">Edit</button>
              <button class="small-action" type="button" data-row-action="schedule-app" data-id="${app.id}">Schedule</button>
              <button class="small-action" type="button" data-row-action="note-app" data-id="${app.id}">Note</button>
              <button class="small-action danger" type="button" data-row-action="delete-app" data-id="${app.id}">Delete</button>
            </div>
          </td>
        </tr>
      `;
    }).join("");
  }

  function renderKanban() {
    const query = getQuery();
    els.kanbanBoard.innerHTML = STATUSES.map((status) => {
      const apps = state.applications
        .filter((app) => app.status === status.id)
        .filter((app) => !query || applicationSearchText(app).includes(query));

      return `
        <section class="kanban-column" data-status="${status.id}" aria-label="${status.label} applications">
          <div class="kanban-column-header">
            <strong>${status.label}</strong>
            <span class="badge ${status.className}">${apps.length}</span>
          </div>
          <div class="kanban-dropzone">
            ${apps.map(renderKanbanCard).join("") || `<div class="empty-state">Drop cards here</div>`}
          </div>
        </section>
      `;
    }).join("");

    bindKanbanDragAndDrop();
  }

  function renderKanbanCard(app) {
    const company = getCompany(app.companyId);
    return `
      <article class="kanban-card" draggable="true" data-app-id="${app.id}">
        <strong>${escapeHtml(app.role)}</strong>
        <p>${escapeHtml(company?.name || "Unknown company")} - ${escapeHtml(app.location || "Location not set")}</p>
        <div class="card-meta">
          <span class="badge priority-${app.priority.toLowerCase()}">${escapeHtml(app.priority)}</span>
          <span>${app.deadline ? relativeDate(app.deadline) : "No deadline"}</span>
        </div>
      </article>
    `;
  }

  // Kanban cards use native drag-and-drop to update stage status.
  function bindKanbanDragAndDrop() {
    els.kanbanBoard.querySelectorAll(".kanban-card").forEach((card) => {
      card.addEventListener("dragstart", (event) => {
        event.dataTransfer.setData("text/plain", card.dataset.appId);
        event.dataTransfer.effectAllowed = "move";
      });
    });

    els.kanbanBoard.querySelectorAll(".kanban-column").forEach((column) => {
      column.addEventListener("dragover", (event) => {
        event.preventDefault();
        column.classList.add("drag-over");
      });
      column.addEventListener("dragleave", () => column.classList.remove("drag-over"));
      column.addEventListener("drop", (event) => {
        event.preventDefault();
        column.classList.remove("drag-over");
        const appId = event.dataTransfer.getData("text/plain");
        const app = getApplication(appId);
        if (!app || app.status === column.dataset.status) return;
        app.status = column.dataset.status;
        saveAndRender("Pipeline updated", `${app.role} moved to ${column.dataset.status}.`, "success");
      });
    });
  }

  function renderCompanies() {
    const query = getQuery();
    const companies = state.companies
      .filter((company) => !query || companySearchText(company).includes(query))
      .sort((a, b) => b.rating - a.rating);

    if (!companies.length) {
      els.companyGrid.innerHTML = `<div class="empty-state">No companies match the current search.</div>`;
      return;
    }

    els.companyGrid.innerHTML = companies.map((company) => {
      const apps = state.applications.filter((app) => app.companyId === company.id);
      const active = apps.filter((app) => !["Rejected", "Offer"].includes(app.status)).length;
      return `
        <article class="company-card">
          <div class="company-head">
            <div>
              <strong>${escapeHtml(company.name)}</strong>
              <div class="item-meta">
                <span>${escapeHtml(company.industry)}</span>
                <span>${escapeHtml(company.size)}</span>
              </div>
            </div>
            <div class="company-score">
              <strong>${company.rating}</strong>
              <span class="muted">fit score</span>
            </div>
          </div>
          <div class="company-facts">
            <span>${escapeHtml(company.location)}</span>
            <span>${escapeHtml(company.contact || "No contact saved")}</span>
            <span>${active} active / ${apps.length} total applications</span>
          </div>
          <p class="note-body">${escapeHtml(company.notes || "No notes yet.")}</p>
          <div class="row-actions">
            ${company.website ? `<a class="small-action" href="${safeUrl(company.website)}" target="_blank" rel="noreferrer">Website</a>` : ""}
            <button class="small-action" type="button" data-row-action="edit-company" data-id="${company.id}">Edit</button>
            <button class="small-action danger" type="button" data-row-action="delete-company" data-id="${company.id}">Delete</button>
          </div>
        </article>
      `;
    }).join("");
  }

  function renderInterviews() {
    const query = getQuery();
    const interviews = state.interviews
      .filter((interview) => !query || interviewSearchText(interview).includes(query))
      .sort((a, b) => new Date(`${a.date}T${a.time || "00:00"}`) - new Date(`${b.date}T${b.time || "00:00"}`));

    if (!interviews.length) {
      els.interviewTimeline.innerHTML = `<div class="empty-state">No interviews match the current search.</div>`;
      return;
    }

    els.interviewTimeline.innerHTML = interviews.map((interview) => {
      const app = getApplication(interview.applicationId);
      const company = getCompany(interview.companyId);
      const date = parseLocalDate(interview.date);
      return `
        <article class="timeline-item">
          <div class="date-tile">
            <span>${date.toLocaleString(undefined, { month: "short" })}</span>
            <strong>${date.getDate()}</strong>
          </div>
          <div>
            <strong>${escapeHtml(interview.title)}</strong>
            <div class="item-meta">
              <span>${escapeHtml(company?.name || "Unknown company")}</span>
              <span>${escapeHtml(app?.role || "Application")}</span>
              <span>${escapeHtml(interview.time || "Time TBD")}</span>
              <span>${escapeHtml(interview.location || "Location TBD")}</span>
            </div>
            <p class="note-body">${escapeHtml(interview.notes || "No preparation notes saved.")}</p>
          </div>
          <div class="row-actions">
            <span class="badge ${interview.status === "Completed" ? "offer" : "interview"}">${escapeHtml(interview.status)}</span>
            <button class="small-action" type="button" data-row-action="edit-interview" data-id="${interview.id}">Edit</button>
            ${interview.status !== "Completed" ? `<button class="small-action" type="button" data-row-action="complete-interview" data-id="${interview.id}">Complete</button>` : ""}
            <button class="small-action danger" type="button" data-row-action="delete-interview" data-id="${interview.id}">Delete</button>
          </div>
        </article>
      `;
    }).join("");
  }

  function renderCalendar() {
    const year = calendarCursor.getFullYear();
    const month = calendarCursor.getMonth();
    const first = new Date(year, month, 1);
    const start = new Date(year, month, 1 - first.getDay());
    const todayIso = iso(new Date());

    els.calendarMonthLabel.textContent = calendarCursor.toLocaleString(undefined, {
      month: "long",
      year: "numeric"
    });

    const cells = [];
    WEEKDAYS.forEach((weekday) => {
      cells.push(`<div class="calendar-weekday">${weekday}</div>`);
    });

    for (let i = 0; i < 42; i += 1) {
      const date = addDays(start, i);
      const dateIso = iso(date);
      const events = getCalendarEvents(dateIso);
      const classes = [
        "calendar-cell",
        date.getMonth() !== month ? "is-muted" : "",
        dateIso === todayIso ? "is-today" : ""
      ].filter(Boolean).join(" ");

      cells.push(`
        <div class="${classes}">
          <div class="calendar-day-number">
            <span>${date.getDate()}</span>
            ${events.length ? `<small>${events.length}</small>` : ""}
          </div>
          <div class="calendar-events">
            ${events.slice(0, 3).map((event) => `
              <div class="calendar-event ${event.type === "deadline" ? "deadline" : ""}" title="${escapeAttr(event.title)}">
                ${escapeHtml(event.title)}
              </div>
            `).join("")}
            ${events.length > 3 ? `<div class="calendar-event">+${events.length - 3} more</div>` : ""}
          </div>
        </div>
      `);
    }

    els.calendarGrid.innerHTML = cells.join("");
  }

  // Analytics are rebuilt on demand so charts stay synced with edits.
  function renderCharts() {
    if (typeof Chart === "undefined") {
      renderChartFallback();
      return;
    }

    clearChartFallback();
    Object.values(charts).forEach((chart) => chart.destroy());
    charts = {};

    const styles = getComputedStyle(document.body);
    const textColor = styles.getPropertyValue("--text").trim();
    const mutedColor = styles.getPropertyValue("--muted").trim();
    const borderColor = styles.getPropertyValue("--border").trim();

    const chartDefaults = {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          labels: {
            color: mutedColor,
            boxWidth: 12,
            usePointStyle: true
          }
        }
      },
      scales: {
        x: {
          ticks: { color: mutedColor },
          grid: { color: borderColor }
        },
        y: {
          ticks: { color: mutedColor },
          grid: { color: borderColor },
          beginAtZero: true
        }
      }
    };

    const statusCounts = getStatusCounts();
    charts.status = new Chart(document.getElementById("statusChart"), {
      type: "doughnut",
      data: {
        labels: STATUSES.map((status) => status.label),
        datasets: [{
          data: STATUSES.map((status) => statusCounts[status.id] || 0),
          backgroundColor: STATUSES.map((status) => status.color),
          borderColor: styles.getPropertyValue("--surface").trim(),
          borderWidth: 3
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: chartDefaults.plugins
      }
    });

    const velocity = getMonthlyVelocity();
    charts.velocity = new Chart(document.getElementById("velocityChart"), {
      type: "line",
      data: {
        labels: velocity.map((item) => item.label),
        datasets: [{
          label: "Applications",
          data: velocity.map((item) => item.count),
          borderColor: "#2563eb",
          backgroundColor: "rgba(37, 99, 235, 0.15)",
          tension: 0.35,
          fill: true,
          pointRadius: 4
        }]
      },
      options: chartDefaults
    });

    const conversionLabels = ["Applied", "Screening", "Interview", "Offer"];
    charts.conversion = new Chart(document.getElementById("conversionChart"), {
      type: "bar",
      data: {
        labels: conversionLabels,
        datasets: [{
          label: "Count",
          data: conversionLabels.map((label) => state.applications.filter((app) => stageRank(app.status) >= stageRank(label)).length),
          backgroundColor: ["#2563eb", "#0891b2", "#7c3aed", "#16a34a"],
          borderRadius: 8
        }]
      },
      options: chartDefaults
    });

    charts.skills = new Chart(document.getElementById("skillsChart"), {
      type: "bar",
      data: {
        labels: state.skills.map((skill) => skill.name),
        datasets: [{
          label: "Current readiness",
          data: state.skills.map((skill) => skill.current),
          backgroundColor: "#22c55e",
          borderRadius: 8
        }, {
          label: "Target",
          data: state.skills.map((skill) => skill.target),
          backgroundColor: "#f97316",
          borderRadius: 8
        }]
      },
      options: {
        ...chartDefaults,
        indexAxis: "y",
        scales: {
          x: {
            max: 100,
            ticks: { color: mutedColor },
            grid: { color: borderColor }
          },
          y: {
            ticks: {
              color: textColor,
              callback(value) {
                const label = this.getLabelForValue(value);
                return label.length > 24 ? `${label.slice(0, 24)}...` : label;
              }
            },
            grid: { color: borderColor }
          }
        }
      }
    });
  }

  function renderChartFallback() {
    document.querySelectorAll(".chart-panel").forEach((panel) => {
      if (!panel.querySelector(".chart-fallback")) {
        panel.insertAdjacentHTML("beforeend", `<div class="empty-state chart-fallback">Chart.js is loading or unavailable. The rest of the workspace remains fully usable.</div>`);
      }
    });
  }

  function clearChartFallback() {
    document.querySelectorAll(".chart-fallback").forEach((fallback) => fallback.remove());
  }

  function renderResumes() {
    const query = getQuery();
    const resumes = state.resumes
      .filter((resume) => !query || resumeSearchText(resume).includes(query))
      .sort((a, b) => new Date(b.updatedDate) - new Date(a.updatedDate));

    if (!resumes.length) {
      els.resumeGrid.innerHTML = `<div class="empty-state">No resume versions match the current search.</div>`;
      return;
    }

    els.resumeGrid.innerHTML = resumes.map((resume) => `
      <article class="resume-card">
        <div class="resume-head">
          <div>
            <strong>${escapeHtml(resume.name)}</strong>
            <div class="item-meta">
              <span>${escapeHtml(resume.targetRole)}</span>
              <span>${formatDate(resume.updatedDate)}</span>
            </div>
          </div>
          <span class="version-pill">${escapeHtml(resume.version)}</span>
        </div>
        <p class="note-body">${escapeHtml(resume.changes || "No version notes saved.")}</p>
        <div class="item-meta">
          <span>${escapeHtml(resume.fileName || "No filename saved")}</span>
          ${resume.active ? `<span class="badge offer">Active</span>` : `<span class="badge saved">Archived</span>`}
        </div>
        <div class="row-actions">
          <button class="small-action" type="button" data-row-action="edit-resume" data-id="${resume.id}">Edit</button>
          <button class="small-action danger" type="button" data-row-action="delete-resume" data-id="${resume.id}">Delete</button>
        </div>
      </article>
    `).join("");
  }

  function renderSkills() {
    const query = getQuery();
    const skills = state.skills
      .filter((skill) => !query || skillSearchText(skill).includes(query))
      .sort((a, b) => priorityRank(a.priority) - priorityRank(b.priority));

    if (!skills.length) {
      els.skillList.innerHTML = `<div class="empty-state">No skill gaps match the current search.</div>`;
      return;
    }

    els.skillList.innerHTML = skills.map((skill) => {
      const gap = Math.max(0, skill.target - skill.current);
      return `
        <article class="skill-card">
          <div class="skill-head">
            <div>
              <strong>${escapeHtml(skill.name)}</strong>
              <div class="item-meta">
                <span>${escapeHtml(skill.category)}</span>
                <span class="badge priority-${skill.priority.toLowerCase()}">${escapeHtml(skill.priority)}</span>
              </div>
            </div>
            <span class="version-pill">${gap} pt gap</span>
          </div>
          <div>
            <div class="progress-meta">
              <span>Current ${skill.current}%</span>
              <span>Target ${skill.target}%</span>
            </div>
            <div class="progress-shell" aria-label="${escapeAttr(skill.name)} readiness ${skill.current} percent">
              <div class="progress-bar" style="width:${clamp(skill.current, 0, 100)}%"></div>
            </div>
          </div>
          <p class="note-body">${escapeHtml(skill.resources || "No learning resource saved.")}</p>
          <div class="row-actions">
            <button class="small-action" type="button" data-row-action="edit-skill" data-id="${skill.id}">Edit</button>
            <button class="small-action danger" type="button" data-row-action="delete-skill" data-id="${skill.id}">Delete</button>
          </div>
        </article>
      `;
    }).join("");
  }

  function renderNotes() {
    const query = getQuery();
    const notes = state.notes
      .filter((note) => !query || noteSearchText(note).includes(query))
      .sort((a, b) => new Date(b.date) - new Date(a.date));

    if (!notes.length) {
      els.notesGrid.innerHTML = `<div class="empty-state">No notes match the current search.</div>`;
      return;
    }

    els.notesGrid.innerHTML = notes.map((note) => {
      const app = getApplication(note.applicationId);
      const company = app ? getCompany(app.companyId) : null;
      return `
        <article class="note-card">
          <div class="note-head">
            <div>
              <strong>${escapeHtml(note.title)}</strong>
              <div class="item-meta">
                <span>${escapeHtml(note.category || "General")}</span>
                <span>${formatDate(note.date)}</span>
              </div>
            </div>
            <span class="badge applied">${escapeHtml(company?.name || "General")}</span>
          </div>
          <p class="note-body">${escapeHtml(note.body || "No note body saved.")}</p>
          <div class="row-actions">
            <button class="small-action" type="button" data-row-action="edit-note" data-id="${note.id}">Edit</button>
            <button class="small-action danger" type="button" data-row-action="delete-note" data-id="${note.id}">Delete</button>
          </div>
        </article>
      `;
    }).join("");
  }

  // Shared modal builder powers every create/edit workflow.
  function openApplicationModal(id = null) {
    const app = id ? getApplication(id) : null;
    const companyOptions = state.companies
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((company) => option(company.id, company.name, app?.companyId))
      .join("");

    openModal({
      eyebrow: "Application",
      title: app ? "Edit Application" : "Add Application",
      html: `
        ${input("role", "Role", app?.role, "text", true)}
        ${select("companyId", "Company", companyOptions, true)}
        ${select("status", "Status", STATUSES.map((status) => option(status.id, status.label, app?.status || "Applied")).join(""))}
        ${select("priority", "Priority", PRIORITIES.map((priority) => option(priority, priority, app?.priority || "Medium")).join(""))}
        ${input("location", "Location", app?.location)}
        ${input("type", "Work Type", app?.type)}
        ${input("salary", "Salary Range", app?.salary)}
        ${input("source", "Source", app?.source)}
        ${input("appliedDate", "Applied Date", app?.appliedDate, "date")}
        ${input("deadline", "Follow-up Deadline", app?.deadline, "date")}
        ${input("contact", "Contact", app?.contact)}
        ${input("url", "Posting URL", app?.url, "url")}
        ${textarea("nextStep", "Next Step", app?.nextStep, true)}
        ${textarea("skillsRequired", "Skills Required", app?.skillsRequired)}
        ${textarea("notes", "Notes", app?.notes)}
        ${formActions(app ? "Save Changes" : "Create Application")}
      `,
      onSubmit: (formData) => {
        const payload = {
          id: app?.id || uid("app"),
          role: clean(formData.get("role")),
          companyId: formData.get("companyId"),
          location: clean(formData.get("location")),
          type: clean(formData.get("type")),
          salary: clean(formData.get("salary")),
          status: formData.get("status"),
          priority: formData.get("priority"),
          source: clean(formData.get("source")),
          appliedDate: formData.get("appliedDate"),
          deadline: formData.get("deadline"),
          contact: clean(formData.get("contact")),
          url: clean(formData.get("url")),
          nextStep: clean(formData.get("nextStep")),
          skillsRequired: clean(formData.get("skillsRequired")),
          notes: clean(formData.get("notes"))
        };

        if (app) {
          Object.assign(app, payload);
        } else {
          state.applications.unshift(payload);
        }
        closeModal();
        saveAndRender(app ? "Application updated" : "Application added", `${payload.role} is now tracked.`, "success");
      }
    });
  }

  function openCompanyModal(id = null) {
    const company = id ? getCompany(id) : null;

    openModal({
      eyebrow: "Company",
      title: company ? "Edit Company" : "Add Company",
      html: `
        ${input("name", "Company Name", company?.name, "text", true)}
        ${input("industry", "Industry", company?.industry, "text", true)}
        ${input("size", "Company Size", company?.size)}
        ${input("location", "Location", company?.location)}
        ${input("website", "Website", company?.website, "url")}
        ${input("contact", "Primary Contact", company?.contact)}
        ${input("rating", "Fit Score", company?.rating ?? 75, "number")}
        ${textarea("notes", "Company Notes", company?.notes)}
        ${formActions(company ? "Save Changes" : "Create Company")}
      `,
      onSubmit: (formData) => {
        const payload = {
          id: company?.id || uid("company"),
          name: clean(formData.get("name")),
          industry: clean(formData.get("industry")),
          size: clean(formData.get("size")),
          location: clean(formData.get("location")),
          website: clean(formData.get("website")),
          contact: clean(formData.get("contact")),
          rating: clamp(Number(formData.get("rating")) || 0, 0, 100),
          notes: clean(formData.get("notes"))
        };

        if (company) {
          Object.assign(company, payload);
        } else {
          state.companies.push(payload);
        }
        closeModal();
        saveAndRender(company ? "Company updated" : "Company added", `${payload.name} is ready for tracking.`, "success");
      }
    });
  }

  function openInterviewModal(id = null, applicationId = null) {
    const interview = id ? getInterview(id) : null;
    const selectedAppId = interview?.applicationId || applicationId || state.applications[0]?.id || "";
    const appOptions = state.applications
      .slice()
      .sort((a, b) => a.role.localeCompare(b.role))
      .map((app) => {
        const company = getCompany(app.companyId);
        return option(app.id, `${app.role} - ${company?.name || "Unknown company"}`, selectedAppId);
      })
      .join("");

    openModal({
      eyebrow: "Interview",
      title: interview ? "Edit Interview" : "Schedule Interview",
      html: `
        ${select("applicationId", "Application", appOptions, true)}
        ${input("title", "Interview Title", interview?.title || "Interview", "text", true)}
        ${select("type", "Interview Type", INTERVIEW_TYPES.map((type) => option(type, type, interview?.type || "Technical")).join(""))}
        ${select("status", "Status", INTERVIEW_STATUSES.map((status) => option(status, status, interview?.status || "Scheduled")).join(""))}
        ${input("date", "Date", interview?.date || iso(addDays(new Date(), 3)), "date", true)}
        ${input("time", "Time", interview?.time || "10:00", "time", true)}
        ${input("interviewer", "Interviewer", interview?.interviewer)}
        ${input("location", "Location / Link", interview?.location)}
        ${textarea("notes", "Preparation Notes", interview?.notes)}
        ${formActions(interview ? "Save Changes" : "Schedule Interview")}
      `,
      onSubmit: (formData) => {
        const app = getApplication(formData.get("applicationId"));
        const payload = {
          id: interview?.id || uid("interview"),
          applicationId: formData.get("applicationId"),
          companyId: app?.companyId || "",
          title: clean(formData.get("title")),
          type: formData.get("type"),
          date: formData.get("date"),
          time: formData.get("time"),
          interviewer: clean(formData.get("interviewer")),
          location: clean(formData.get("location")),
          status: formData.get("status"),
          notes: clean(formData.get("notes"))
        };

        if (interview) {
          Object.assign(interview, payload);
        } else {
          state.interviews.push(payload);
          if (app && stageRank(app.status) < stageRank("Interview")) {
            app.status = "Interview";
          }
        }
        closeModal();
        saveAndRender(interview ? "Interview updated" : "Interview scheduled", `${payload.title} is on the calendar.`, "success");
      }
    });
  }

  function openResumeModal(id = null) {
    const resume = id ? getResume(id) : null;

    openModal({
      eyebrow: "Resume",
      title: resume ? "Edit Resume Version" : "Add Resume Version",
      html: `
        ${input("name", "Resume Name", resume?.name || "Product Resume", "text", true)}
        ${input("version", "Version", resume?.version || "v1.0", "text", true)}
        ${input("targetRole", "Target Role", resume?.targetRole, "text", true)}
        ${input("fileName", "File Name", resume?.fileName)}
        ${input("updatedDate", "Updated Date", resume?.updatedDate || iso(new Date()), "date", true)}
        ${select("active", "Status", [option("true", "Active", String(Boolean(resume?.active))), option("false", "Archived", String(Boolean(resume?.active)))].join(""))}
        ${textarea("changes", "Version Notes", resume?.changes)}
        ${formActions(resume ? "Save Changes" : "Add Version")}
      `,
      onSubmit: (formData) => {
        const isActive = formData.get("active") === "true";
        if (isActive) {
          state.resumes.forEach((item) => {
            item.active = false;
          });
        }

        const payload = {
          id: resume?.id || uid("resume"),
          name: clean(formData.get("name")),
          version: clean(formData.get("version")),
          targetRole: clean(formData.get("targetRole")),
          fileName: clean(formData.get("fileName")),
          updatedDate: formData.get("updatedDate"),
          changes: clean(formData.get("changes")),
          active: isActive
        };

        if (resume) {
          Object.assign(resume, payload);
        } else {
          state.resumes.unshift(payload);
        }
        closeModal();
        saveAndRender(resume ? "Resume updated" : "Resume version added", `${payload.name} ${payload.version} is saved.`, "success");
      }
    });
  }

  function openSkillModal(id = null) {
    const skill = id ? getSkill(id) : null;

    openModal({
      eyebrow: "Skill Gap",
      title: skill ? "Edit Skill Gap" : "Add Skill Gap",
      html: `
        ${input("name", "Skill", skill?.name, "text", true)}
        ${input("category", "Category", skill?.category, "text", true)}
        ${input("current", "Current Readiness", skill?.current ?? 50, "number", true)}
        ${input("target", "Target Readiness", skill?.target ?? 80, "number", true)}
        ${select("priority", "Priority", PRIORITIES.map((priority) => option(priority, priority, skill?.priority || "Medium")).join(""))}
        ${textarea("resources", "Learning Plan", skill?.resources)}
        ${formActions(skill ? "Save Changes" : "Add Skill")}
      `,
      onSubmit: (formData) => {
        const payload = {
          id: skill?.id || uid("skill"),
          name: clean(formData.get("name")),
          category: clean(formData.get("category")),
          current: clamp(Number(formData.get("current")) || 0, 0, 100),
          target: clamp(Number(formData.get("target")) || 0, 0, 100),
          priority: formData.get("priority"),
          resources: clean(formData.get("resources"))
        };

        if (skill) {
          Object.assign(skill, payload);
        } else {
          state.skills.push(payload);
        }
        closeModal();
        saveAndRender(skill ? "Skill updated" : "Skill added", `${payload.name} readiness is tracked.`, "success");
      }
    });
  }

  function openNoteModal(id = null, applicationId = null) {
    const note = id ? getNote(id) : null;
    const selectedAppId = note?.applicationId || applicationId || "";
    const appOptions = [
      `<option value="">General note</option>`,
      ...state.applications.map((app) => {
        const company = getCompany(app.companyId);
        return option(app.id, `${app.role} - ${company?.name || "Unknown company"}`, selectedAppId);
      })
    ].join("");

    openModal({
      eyebrow: "Note",
      title: note ? "Edit Note" : "Add Note",
      html: `
        ${select("applicationId", "Related Application", appOptions)}
        ${input("title", "Title", note?.title, "text", true)}
        ${input("category", "Category", note?.category || "Interview Notes")}
        ${input("date", "Date", note?.date || iso(new Date()), "date", true)}
        ${textarea("body", "Note", note?.body, true)}
        ${formActions(note ? "Save Changes" : "Add Note")}
      `,
      onSubmit: (formData) => {
        const payload = {
          id: note?.id || uid("note"),
          applicationId: formData.get("applicationId"),
          title: clean(formData.get("title")),
          category: clean(formData.get("category")),
          date: formData.get("date"),
          body: clean(formData.get("body"))
        };

        if (note) {
          Object.assign(note, payload);
        } else {
          state.notes.unshift(payload);
        }
        closeModal();
        saveAndRender(note ? "Note updated" : "Note added", payload.title, "success");
      }
    });
  }

  function openModal({ eyebrow, title, html, onSubmit }) {
    els.modalEyebrow.textContent = eyebrow;
    els.modalTitle.textContent = title;
    els.modalForm.innerHTML = html;
    currentFormHandler = onSubmit;
    els.modalBackdrop.hidden = false;
    document.body.style.overflow = "hidden";
    requestAnimationFrame(() => {
      const firstControl = els.modalForm.querySelector("input, select, textarea, button");
      firstControl?.focus();
    });
  }

  function closeModal() {
    els.modalBackdrop.hidden = true;
    els.modalForm.innerHTML = "";
    currentFormHandler = null;
    document.body.style.overflow = "";
  }

  // Delete handlers protect linked data where needed and refresh the UI.
  function deleteApplication(id) {
    const app = getApplication(id);
    if (!app || !confirm(`Delete ${app.role}? This also removes linked interviews and notes.`)) return;
    state.applications = state.applications.filter((item) => item.id !== id);
    state.interviews = state.interviews.filter((item) => item.applicationId !== id);
    state.notes = state.notes.filter((item) => item.applicationId !== id);
    saveAndRender("Application deleted", `${app.role} was removed.`, "warning");
  }

  function deleteCompany(id) {
    const company = getCompany(id);
    if (!company) return;
    const linkedApps = state.applications.filter((app) => app.companyId === id).length;
    if (linkedApps) {
      toast("Company in use", `Move or delete ${linkedApps} linked applications first.`, "warning");
      return;
    }
    if (!confirm(`Delete ${company.name}?`)) return;
    state.companies = state.companies.filter((item) => item.id !== id);
    saveAndRender("Company deleted", `${company.name} was removed.`, "warning");
  }

  function updateInterviewStatus(id, status) {
    const interview = getInterview(id);
    if (!interview) return;
    interview.status = status;
    saveAndRender("Interview completed", `${interview.title} is marked complete.`, "success");
  }

  function deleteInterview(id) {
    const interview = getInterview(id);
    if (!interview || !confirm(`Delete ${interview.title}?`)) return;
    state.interviews = state.interviews.filter((item) => item.id !== id);
    saveAndRender("Interview deleted", `${interview.title} was removed.`, "warning");
  }

  function deleteResume(id) {
    const resume = getResume(id);
    if (!resume || !confirm(`Delete ${resume.name} ${resume.version}?`)) return;
    state.resumes = state.resumes.filter((item) => item.id !== id);
    saveAndRender("Resume deleted", `${resume.version} was removed.`, "warning");
  }

  function deleteSkill(id) {
    const skill = getSkill(id);
    if (!skill || !confirm(`Delete ${skill.name}?`)) return;
    state.skills = state.skills.filter((item) => item.id !== id);
    saveAndRender("Skill deleted", `${skill.name} was removed.`, "warning");
  }

  function deleteNote(id) {
    const note = getNote(id);
    if (!note || !confirm(`Delete ${note.title}?`)) return;
    state.notes = state.notes.filter((item) => item.id !== id);
    saveAndRender("Note deleted", `${note.title} was removed.`, "warning");
  }

  function saveAndRender(title, message, type = "success") {
    saveState();
    renderAll();
    toast(title, message, type);
  }

  // Export helpers generate portable files without a backend service.
  function exportApplicationsCsv() {
    const rows = getFilteredApplications().map((app) => {
      const company = getCompany(app.companyId);
      return {
        Role: app.role,
        Company: company?.name || "",
        Status: app.status,
        Priority: app.priority,
        Location: app.location,
        Type: app.type,
        Salary: app.salary,
        Source: app.source,
        AppliedDate: app.appliedDate,
        FollowUpDeadline: app.deadline,
        Contact: app.contact,
        NextStep: app.nextStep,
        SkillsRequired: app.skillsRequired,
        Notes: app.notes
      };
    });

    const headers = Object.keys(rows[0] || {
      Role: "",
      Company: "",
      Status: "",
      Priority: "",
      Location: "",
      Type: "",
      Salary: "",
      Source: "",
      AppliedDate: "",
      FollowUpDeadline: "",
      Contact: "",
      NextStep: "",
      SkillsRequired: "",
      Notes: ""
    });

    const csv = [
      headers.join(","),
      ...rows.map((row) => headers.map((header) => csvEscape(row[header])).join(","))
    ].join("\n");

    downloadBlob(csv, `careertrack-applications-${iso(new Date())}.csv`, "text/csv;charset=utf-8");
    toast("CSV exported", `${rows.length} applications exported.`, "success");
  }

  function generatePdfReport() {
    const statusCounts = getStatusCounts();
    const upcoming = getUpcomingInterviews(30);
    const activeResume = state.resumes.find((resume) => resume.active);
    const skillAverage = state.skills.length
      ? Math.round(state.skills.reduce((total, skill) => total + skill.current, 0) / state.skills.length)
      : 0;

    const lines = [
      "CareerTrack Pro Report",
      `Generated: ${new Date().toLocaleString()}`,
      "",
      `Applications: ${state.applications.length}`,
      `Active opportunities: ${state.applications.filter((app) => !["Rejected", "Offer"].includes(app.status)).length}`,
      `Upcoming interviews: ${upcoming.length}`,
      `Offers: ${statusCounts.Offer || 0}`,
      `Average skill readiness: ${skillAverage}%`,
      `Active resume: ${activeResume ? `${activeResume.name} ${activeResume.version}` : "None"}`,
      "",
      "Pipeline Summary:",
      ...STATUSES.map((status) => `- ${status.label}: ${statusCounts[status.id] || 0}`),
      "",
      "Priority Follow-ups:",
      ...state.applications
        .filter((app) => app.deadline && !["Rejected", "Offer"].includes(app.status))
        .sort((a, b) => new Date(a.deadline) - new Date(b.deadline))
        .slice(0, 6)
        .map((app) => {
          const company = getCompany(app.companyId);
          return `- ${app.role} at ${company?.name || "Unknown"}: ${app.nextStep || "Follow up"} (${formatDate(app.deadline)})`;
        }),
      "",
      "Upcoming Interviews:",
      ...upcoming.slice(0, 6).map((interview) => {
        const company = getCompany(interview.companyId);
        return `- ${interview.title} with ${company?.name || "Unknown"} on ${formatDate(interview.date)} at ${interview.time}`;
      })
    ];

    const pdf = createSimplePdf(lines);
    downloadBlob(pdf, `careertrack-report-${iso(new Date())}.pdf`, "application/pdf");
    toast("PDF report generated", "A summary report was downloaded.", "success");
  }

  function createSimplePdf(lines) {
    const escapedLines = lines.slice(0, 44).map((line) => pdfEscape(String(line).slice(0, 92)));
    let y = 760;
    const content = [
      "BT",
      "/F1 18 Tf",
      `50 ${y} Td`,
      `(${escapedLines[0] || "CareerTrack Pro Report"}) Tj`,
      "/F1 10 Tf",
      "0 -26 Td"
    ];

    escapedLines.slice(1).forEach((line) => {
      content.push(`(${line || " "}) Tj`);
      content.push("0 -15 Td");
      y -= 15;
    });
    content.push("ET");

    const stream = content.join("\n");
    const objects = [
      "<< /Type /Catalog /Pages 2 0 R >>",
      "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
      "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
      "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
      `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`
    ];

    let pdf = "%PDF-1.4\n";
    const offsets = [0];
    objects.forEach((object, index) => {
      offsets.push(pdf.length);
      pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
    });

    const xrefOffset = pdf.length;
    pdf += `xref\n0 ${objects.length + 1}\n`;
    pdf += "0000000000 65535 f \n";
    offsets.slice(1).forEach((offset) => {
      pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
    });
    pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
    return pdf;
  }

  // Theme state is persisted alongside workspace data.
  function toggleTheme() {
    state.settings.theme = state.settings.theme === "dark" ? "light" : "dark";
    saveState();
    applyTheme();
    if (activeView === "analytics") {
      renderCharts();
    }
    toast("Theme updated", `${titleCase(state.settings.theme)} mode is active.`, "success");
  }

  function applyTheme() {
    const isDark = state.settings.theme === "dark";
    els.body.classList.toggle("dark", isDark);
    els.themeToggle.textContent = isDark ? "Light Mode" : "Dark Mode";
    els.themeToggle.setAttribute("aria-pressed", String(isDark));
  }

  // Query helpers centralize filtering across every collection.
  function getFilteredApplications() {
    const query = getQuery();
    const status = els.statusFilter.value || "All";
    const company = els.companyFilter.value || "All";

    return state.applications
      .filter((app) => status === "All" || app.status === status)
      .filter((app) => company === "All" || app.companyId === company)
      .filter((app) => !query || applicationSearchText(app).includes(query))
      .sort((a, b) => priorityRank(a.priority) - priorityRank(b.priority) || new Date(b.appliedDate || 0) - new Date(a.appliedDate || 0));
  }

  function getUpcomingInterviews(daysAhead = 14) {
    const today = startOfDay(new Date());
    const limit = addDays(today, daysAhead);
    return state.interviews
      .filter((interview) => interview.status !== "Cancelled")
      .filter((interview) => {
        const date = parseLocalDate(interview.date);
        return date >= today && date <= limit;
      })
      .sort((a, b) => new Date(`${a.date}T${a.time || "00:00"}`) - new Date(`${b.date}T${b.time || "00:00"}`));
  }

  function getCalendarEvents(dateIso) {
    const interviewEvents = state.interviews
      .filter((interview) => interview.date === dateIso && interview.status !== "Cancelled")
      .map((interview) => {
        const company = getCompany(interview.companyId);
        return {
          type: "interview",
          title: `${interview.time} ${company?.name || "Interview"}`
        };
      });

    const deadlineEvents = state.applications
      .filter((app) => app.deadline === dateIso && !["Rejected", "Offer"].includes(app.status))
      .map((app) => {
        const company = getCompany(app.companyId);
        return {
          type: "deadline",
          title: `Follow up: ${company?.name || app.role}`
        };
      });

    return [...interviewEvents, ...deadlineEvents];
  }

  function getStatusCounts() {
    return state.applications.reduce((counts, app) => {
      counts[app.status] = (counts[app.status] || 0) + 1;
      return counts;
    }, {});
  }

  function getMonthlyVelocity() {
    const cursor = startOfMonth(new Date());
    const months = [];
    for (let i = 5; i >= 0; i -= 1) {
      const monthDate = addMonths(cursor, -i);
      const monthKey = monthDate.toISOString().slice(0, 7);
      months.push({
        key: monthKey,
        label: monthDate.toLocaleString(undefined, { month: "short" }),
        count: state.applications.filter((app) => (app.appliedDate || "").startsWith(monthKey)).length
      });
    }
    return months;
  }

  // Entity lookups keep renderer templates readable.
  function getApplication(id) {
    return state.applications.find((app) => app.id === id);
  }

  function getCompany(id) {
    return state.companies.find((company) => company.id === id);
  }

  function getInterview(id) {
    return state.interviews.find((interview) => interview.id === id);
  }

  function getResume(id) {
    return state.resumes.find((resume) => resume.id === id);
  }

  function getSkill(id) {
    return state.skills.find((skill) => skill.id === id);
  }

  function getNote(id) {
    return state.notes.find((note) => note.id === id);
  }

  function getStatusMeta(statusId) {
    return STATUSES.find((status) => status.id === statusId) || STATUSES[0];
  }

  // Search text builders decide what each global search should match.
  function applicationSearchText(app) {
    const company = getCompany(app.companyId);
    return normalize([
      app.role,
      company?.name,
      app.status,
      app.priority,
      app.location,
      app.type,
      app.source,
      app.contact,
      app.nextStep,
      app.skillsRequired,
      app.notes
    ].join(" "));
  }

  function companySearchText(company) {
    return normalize([company.name, company.industry, company.location, company.contact, company.notes].join(" "));
  }

  function interviewSearchText(interview) {
    const app = getApplication(interview.applicationId);
    const company = getCompany(interview.companyId);
    return normalize([interview.title, interview.type, interview.status, interview.interviewer, interview.location, interview.notes, app?.role, company?.name].join(" "));
  }

  function resumeSearchText(resume) {
    return normalize([resume.name, resume.version, resume.targetRole, resume.fileName, resume.changes].join(" "));
  }

  function skillSearchText(skill) {
    return normalize([skill.name, skill.category, skill.priority, skill.resources].join(" "));
  }

  function noteSearchText(note) {
    const app = getApplication(note.applicationId);
    const company = app ? getCompany(app.companyId) : null;
    return normalize([note.title, note.category, note.body, app?.role, company?.name].join(" "));
  }

  function getQuery() {
    return normalize(els.globalSearch.value);
  }

  function stageRank(status) {
    return Math.max(0, STATUSES.findIndex((item) => item.id === status));
  }

  function priorityRank(priority) {
    return { High: 0, Medium: 1, Low: 2 }[priority] ?? 3;
  }

  function getInitialView() {
    const hash = window.location.hash.replace("#", "");
    return document.querySelector(`[data-view="${hash}"]`) ? hash : "dashboard";
  }

  function toast(title, message, type = "success") {
    const toastEl = document.createElement("div");
    toastEl.className = `toast ${type}`;
    toastEl.innerHTML = `
      <strong>${escapeHtml(title)}</strong>
      <span>${escapeHtml(message)}</span>
    `;
    els.toastRegion.appendChild(toastEl);
    setTimeout(() => {
      toastEl.style.opacity = "0";
      toastEl.style.transform = "translateY(8px)";
      setTimeout(() => toastEl.remove(), 220);
    }, 3600);
  }

  // Form field helpers keep the modal markup consistent.
  function input(name, label, value = "", type = "text", required = false) {
    const extra = type === "number" ? ` min="0" max="100"` : "";
    return `
      <div class="form-field">
        <label for="${name}">${label}</label>
        <input id="${name}" name="${name}" type="${type}" value="${escapeAttr(value ?? "")}"${required ? " required" : ""}${extra}>
      </div>
    `;
  }

  function select(name, label, optionsHtml, required = false) {
    return `
      <div class="form-field">
        <label for="${name}">${label}</label>
        <select id="${name}" name="${name}"${required ? " required" : ""}>${optionsHtml}</select>
      </div>
    `;
  }

  function textarea(name, label, value = "", required = false) {
    return `
      <div class="form-field full">
        <label for="${name}">${label}</label>
        <textarea id="${name}" name="${name}"${required ? " required" : ""}>${escapeHtml(value ?? "")}</textarea>
      </div>
    `;
  }

  function option(value, label, selectedValue = "") {
    return `<option value="${escapeAttr(value)}"${String(value) === String(selectedValue) ? " selected" : ""}>${escapeHtml(label)}</option>`;
  }

  function formActions(label) {
    return `
      <div class="form-actions">
        <button class="button button-muted" type="button" data-action="close-modal">Cancel</button>
        <button class="button button-primary" type="submit">${label}</button>
      </div>
    `;
  }

  // Utility helpers cover formatting, escaping, dates, and debouncing.
  function downloadBlob(content, filename, type) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  function safeUrl(url) {
    const value = clean(url);
    if (!value) return "#";
    if (/^https?:\/\//i.test(value)) return escapeAttr(value);
    return escapeAttr(`https://${value}`);
  }

  function csvEscape(value) {
    const text = String(value ?? "");
    return `"${text.replace(/"/g, '""')}"`;
  }

  function pdfEscape(value) {
    return value.replace(/[\\()]/g, (char) => `\\${char}`);
  }

  function clean(value) {
    return String(value ?? "").trim();
  }

  function normalize(value) {
    return String(value ?? "").toLowerCase().trim();
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function escapeAttr(value) {
    return escapeHtml(value).replace(/`/g, "&#096;");
  }

  function uid(prefix) {
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
  }

  function iso(date) {
    const local = new Date(date);
    local.setMinutes(local.getMinutes() - local.getTimezoneOffset());
    return local.toISOString().slice(0, 10);
  }

  function parseLocalDate(dateString) {
    if (!dateString) return new Date(NaN);
    const [year, month, day] = dateString.split("-").map(Number);
    return new Date(year, month - 1, day);
  }

  function startOfDay(date) {
    const next = new Date(date);
    next.setHours(0, 0, 0, 0);
    return next;
  }

  function startOfMonth(date) {
    return new Date(date.getFullYear(), date.getMonth(), 1);
  }

  function addDays(date, amount) {
    const next = new Date(date);
    next.setDate(next.getDate() + amount);
    return next;
  }

  function addMonths(date, amount) {
    return new Date(date.getFullYear(), date.getMonth() + amount, 1);
  }

  function formatDate(dateString) {
    if (!dateString) return "Not set";
    return parseLocalDate(dateString).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric"
    });
  }

  function relativeDate(dateString) {
    const date = parseLocalDate(dateString);
    const today = startOfDay(new Date());
    const diff = Math.round((date - today) / 86400000);
    if (Number.isNaN(diff)) return "No date";
    if (diff === 0) return "Today";
    if (diff === 1) return "Tomorrow";
    if (diff === -1) return "Yesterday";
    if (diff > 1) return `In ${diff} days`;
    return `${Math.abs(diff)} days ago`;
  }

  function titleCase(value) {
    return String(value)
      .replace(/-/g, " ")
      .replace(/\b\w/g, (char) => char.toUpperCase());
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function debounce(callback, delay) {
    let timer = null;
    return (...args) => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => callback(...args), delay);
    };
  }

  return { init };
})();

document.addEventListener("DOMContentLoaded", CareerTrackPro.init);
