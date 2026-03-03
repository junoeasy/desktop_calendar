const connectBtn = document.getElementById("connectBtn");
const refreshBtn = document.getElementById("refreshBtn");
const logoutBtn = document.getElementById("logoutBtn");
const statusText = document.getElementById("statusText");
const eventsList = document.getElementById("eventsList");
const monthTitle = document.getElementById("monthTitle");
const calendarGrid = document.getElementById("calendarGrid");
const prevMonth = document.getElementById("prevMonth");
const nextMonth = document.getElementById("nextMonth");

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];
let currentDate = new Date();

function formatDateTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function renderMonthGrid(date) {
  const year = date.getFullYear();
  const month = date.getMonth();
  monthTitle.textContent = `${year}년 ${month + 1}월`;
  calendarGrid.innerHTML = "";

  WEEKDAYS.forEach((weekday) => {
    const div = document.createElement("div");
    div.className = "weekday";
    div.textContent = weekday;
    calendarGrid.appendChild(div);
  });

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrevMonth = new Date(year, month, 0).getDate();
  const today = new Date();

  for (let i = 0; i < firstDay; i += 1) {
    const day = document.createElement("div");
    day.className = "day-cell muted";
    day.textContent = String(daysInPrevMonth - firstDay + i + 1);
    calendarGrid.appendChild(day);
  }

  for (let dayNumber = 1; dayNumber <= daysInMonth; dayNumber += 1) {
    const day = document.createElement("div");
    day.className = "day-cell";
    day.textContent = String(dayNumber);

    const isToday =
      year === today.getFullYear() &&
      month === today.getMonth() &&
      dayNumber === today.getDate();
    if (isToday) {
      day.classList.add("today");
    }

    calendarGrid.appendChild(day);
  }

  const totalCells = firstDay + daysInMonth;
  const trailingCells = (7 - (totalCells % 7)) % 7;
  for (let i = 1; i <= trailingCells; i += 1) {
    const day = document.createElement("div");
    day.className = "day-cell muted";
    day.textContent = String(i);
    calendarGrid.appendChild(day);
  }
}

function renderEvents(events) {
  eventsList.innerHTML = "";
  if (!events.length) {
    const li = document.createElement("li");
    li.className = "event-item";
    li.textContent = "예정된 일정이 없습니다.";
    eventsList.appendChild(li);
    return;
  }

  events.forEach((event) => {
    const li = document.createElement("li");
    li.className = "event-item";

    const title = document.createElement("h3");
    title.textContent = event.summary;

    const when = document.createElement("p");
    when.className = "event-meta";
    when.textContent = `${formatDateTime(event.start)} ~ ${formatDateTime(event.end)}`;

    const location = document.createElement("p");
    location.className = "event-meta";
    location.textContent = event.location ? `장소: ${event.location}` : "장소: -";

    li.appendChild(title);
    li.appendChild(when);
    li.appendChild(location);

    if (event.htmlLink) {
      const link = document.createElement("a");
      link.href = event.htmlLink;
      link.target = "_blank";
      link.textContent = "Google Calendar에서 열기";
      li.appendChild(link);
    }

    eventsList.appendChild(li);
  });
}

async function refreshEvents() {
  statusText.textContent = "일정을 불러오는 중...";
  try {
    const result = await window.desktopCalendar.listEvents(30);
    if (!result.connected) {
      statusText.textContent = "Google 계정을 연결해주세요.";
      renderEvents([]);
      return;
    }
    statusText.textContent = `총 ${result.events.length}개의 일정을 표시합니다.`;
    renderEvents(result.events);
  } catch (error) {
    statusText.textContent = `일정 조회 실패: ${error.message}`;
  }
}

async function initAuthState() {
  try {
    const status = await window.desktopCalendar.authStatus();
    statusText.textContent = status.connected
      ? "연결됨. 새로고침으로 일정을 갱신할 수 있습니다."
      : "Google 계정을 연결해주세요.";
    if (status.connected) {
      refreshEvents();
    }
  } catch (error) {
    statusText.textContent = `상태 확인 실패: ${error.message}`;
  }
}

connectBtn.addEventListener("click", async () => {
  statusText.textContent = "브라우저에서 Google 로그인 진행 중...";
  try {
    await window.desktopCalendar.connectGoogle();
    statusText.textContent = "연결 완료.";
    refreshEvents();
  } catch (error) {
    statusText.textContent = `연결 실패: ${error.message}`;
  }
});

refreshBtn.addEventListener("click", refreshEvents);

logoutBtn.addEventListener("click", async () => {
  await window.desktopCalendar.logoutGoogle();
  statusText.textContent = "로그아웃되었습니다.";
  renderEvents([]);
});

prevMonth.addEventListener("click", () => {
  currentDate = new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1);
  renderMonthGrid(currentDate);
});

nextMonth.addEventListener("click", () => {
  currentDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1);
  renderMonthGrid(currentDate);
});

renderMonthGrid(currentDate);
initAuthState();
