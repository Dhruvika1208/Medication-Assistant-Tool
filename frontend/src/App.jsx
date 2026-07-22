import { useState, useEffect, useRef } from "react";
import axios from "axios";
import { 
  Activity, 
  Bell, 
  Calendar as CalendarIcon, 
  ChevronDown, 
  Check, 
  Clock, 
  ShieldAlert, 
  ShieldCheck, 
  Trash2, 
  Edit, 
  Plus, 
  LogOut, 
  Sun, 
  Moon, 
  Lock, 
  Mail, 
  User, 
  Info, 
  ArrowRight, 
  CornerDownRight, 
  Menu, 
  X, 
  ArrowUpRight, 
  HelpCircle, 
  Eye, 
  EyeOff, 
  CheckCircle2, 
  AlertTriangle, 
  UserCheck, 
  Compass, 
  LayoutDashboard,
  MessageSquare,
  Bookmark
} from "lucide-react";
import "./App.css";

const API_BASE = "http://localhost:8000";

const SUGGESTED_QUESTIONS = [
  { drug: "Amoxicillin", question: "What are the common side effects of Amoxicillin?" },
  { drug: "Metformin", question: "What warnings are associated with Metformin?" },
  { drug: "Ibuprofen", question: "What are the contraindications for Ibuprofen?" },
  { drug: "Acetaminophen", question: "How should Acetaminophen be stored?" },
  { drug: "Simvastatin", question: "What drug interactions are listed for Simvastatin?" }
];

// Custom MediRAG minimalist capsule + AI spark brand mark
const MediRagLogo = ({ size = 26, className = "" }) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 32 32" 
    fill="none" 
    className={`medirag-brand-logo ${className}`}
    xmlns="http://www.w3.org/2000/svg"
  >
    <rect x="4" y="10" width="20" height="12" rx="6" stroke="var(--brand-teal)" strokeWidth="2.5" fill="none" transform="rotate(-35 14 16)" />
    <line x1="9.5" y1="7" x2="18.5" y2="23" stroke="var(--brand-teal)" strokeWidth="2" strokeDasharray="2 1" />
    <path d="M24 3 C24 6.5 25.5 8 29 8 C25.5 8 24 9.5 24 13 C24 9.5 22.5 8 19 8 C22.5 8 24 6.5 24 3 Z" fill="var(--brand-teal)" />
    <circle cx="27" cy="16" r="1.5" fill="var(--brand-aqua)" />
  </svg>
);

function App() {
  // Navigation & Theme
  const [activeTab, setActiveTab] = useState("home"); // home, dashboard, assistant, reminders, profile
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [theme, setTheme] = useState(() => localStorage.getItem("theme") || "dark");

  // Auth State
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(() => localStorage.getItem("token") || null);
  const [authMode, setAuthMode] = useState("login"); // login | signup
  const [authError, setAuthError] = useState("");
  const [authLoading, setAuthLoading] = useState(false);
  
  // Auth Form Fields
  const [authForm, setAuthForm] = useState({
    fullName: "",
    email: "",
    password: "",
    confirmPassword: ""
  });
  const [showPassword, setShowPassword] = useState(false);

  // Reminders & Calendar
  const [reminders, setReminders] = useState([]);
  const [selectedDate, setSelectedDate] = useState(getTodayDateString());
  const [dateSchedule, setDateSchedule] = useState([]);
  const [showDrawer, setShowDrawer] = useState(false);
  const [editingReminderId, setEditingReminderId] = useState(null);
  
  const [reminderForm, setReminderForm] = useState({
    medicine_name: "",
    dosage: "",
    frequency: "once_daily",
    times: ["08:00"],
    start_date: getTodayDateString(),
    end_date: "",
    instructions: "",
    notes: "",
  });

  // AI Chat states
  const [drugName, setDrugName] = useState("");
  const [question, setQuestion] = useState("");
  const [availableDrugs, setAvailableDrugs] = useState([]);
  const [drugSuggestions, setDrugSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [chatMessages, setChatMessages] = useState([
    {
      sender: "ai",
      text: "Hello! I am MediRAG, your AI Medication Assistant. Ask me questions about your medications (side effects, dosage, warnings, interactions, storage) and I will retrieve grounded FDA drug label details to answer clearly.",
    },
  ]);
  const [loadingChat, setLoadingChat] = useState(false);
  const [chatError, setChatError] = useState("");

  // Profile Form States
  const [profileForm, setProfileForm] = useState({
    full_name: "",
    current_password: "",
    new_password: "",
    confirm_new_password: ""
  });
  const [profileError, setProfileError] = useState("");
  const [profileSuccess, setProfileSuccess] = useState("");

  // Countdown & Progress
  const [nextReminder, setNextReminder] = useState(null);
  const [countdownText, setCountdownText] = useState("");

  // Toast State
  const [toast, setToast] = useState(null);

  // Ref to chat auto-scroll & fired reminders tracker
  const chatEndRef = useRef(null);
  const firedRemindersRef = useRef(new Set());

  // 1. Initial Load and Theme configuration
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("theme", theme);
  }, [theme]);

  // Set Authorization headers when token changes
  useEffect(() => {
    if (token) {
      localStorage.setItem("token", token);
      axios.defaults.headers.common["Authorization"] = `Bearer ${token}`;
      fetchUserProfile();
    } else {
      localStorage.removeItem("token");
      delete axios.defaults.headers.common["Authorization"];
      setUser(null);
      if (activeTab !== "home") {
        setActiveTab("home");
      }
    }
  }, [token]);

  // Load active data once logged in
  useEffect(() => {
    if (user) {
      fetchReminders();
      fetchDateSchedule(selectedDate);
      fetchAvailableDrugs();
    }
  }, [user, selectedDate]);

  // Scroll to bottom of chat when feed updates
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages, loadingChat]);

  // Trigger reminders countdown updates
  useEffect(() => {
    calculateNextReminder();
    const timer = setInterval(() => {
      calculateNextReminder();
    }, 30000);
    return () => clearInterval(timer);
  }, [dateSchedule]);

  // Real-time Reminder Scheduler & Notification Listener
  useEffect(() => {
    if (!token || !reminders || reminders.length === 0) return;

    const checkSchedule = () => {
      const todayStr = getTodayDateString();
      const nowTimeStr = getCurrentTimeString();

      reminders.forEach((r) => {
        if (!r.is_enabled) return;
        if (r.start_date && r.start_date > todayStr) return;
        if (r.end_date && r.end_date < todayStr) return;

        const rTimes = (r.times || "").split(",").map((t) => t.trim());
        rTimes.forEach((t) => {
          if (t === nowTimeStr) {
            const key = `${todayStr}_${t}_${r.id}`;
            if (!firedRemindersRef.current.has(key)) {
              firedRemindersRef.current.add(key);

              console.log(`[Scheduler] Due reminder detected: ${r.medicine_name} at ${t}`);

              // 1. Desktop Browser Notification
              if (typeof window !== "undefined" && Notification.permission === "granted") {
                try {
                  new Notification(`Medication Reminder: ${r.medicine_name}`, {
                    body: `Time to take ${r.dosage}.\nInstructions: ${r.instructions || "Take as prescribed."}`,
                    icon: "/favicon.svg",
                  });
                } catch (e) {
                  console.error("Browser notification error:", e);
                }
              }

              // 2. In-App Toast Notification
              showToast(`⏰ Medication Reminder: Time to take ${r.medicine_name} (${r.dosage})`, "success");
            }
          }
        });
      });
    };

    checkSchedule();
    const interval = setInterval(checkSchedule, 10000);
    return () => clearInterval(interval);
  }, [token, reminders]);

  // Browser Notification permissions state
  const [notificationPermission, setNotificationPermission] = useState(
    typeof window !== "undefined" ? Notification.permission : "default"
  );

  const requestNotificationPermission = () => {
    if (!("Notification" in window)) {
      alert("This browser does not support desktop notifications.");
      return;
    }
    Notification.requestPermission().then((permission) => {
      setNotificationPermission(permission);
      if (permission === "granted") {
        showToast("Browser notifications enabled!");
      } else {
        showToast("Notification permission was denied.", "error");
      }
    });
  };

  const sendTestNotification = () => {
    if (!("Notification" in window)) {
      alert("This browser does not support desktop notifications.");
      return;
    }
    if (Notification.permission !== "granted") {
      Notification.requestPermission().then((permission) => {
        setNotificationPermission(permission);
        if (permission === "granted") {
          fireTestNotification();
        } else {
          showToast("Please allow notification permissions in your browser.", "error");
        }
      });
    } else {
      fireTestNotification();
    }
  };

  const fireTestNotification = () => {
    try {
      new Notification("MediRAG Test Reminder", {
        body: "Notifications are working correctly.",
        icon: "/favicon.svg",
      });
      showToast("Test notification sent!");
    } catch (e) {
      console.error("Test notification error:", e);
      showToast("Failed to trigger browser notification.", "error");
    }
  };

  const handleCreateTestReminder = async () => {
    const now = new Date(Date.now() + 60000); // 1 minute from now
    const testTime = [
      now.getHours().toString().padStart(2, "0"),
      now.getMinutes().toString().padStart(2, "0")
    ].join(":");
    const todayStr = getTodayDateString();

    console.log(`==================== TEST REMINDER MODE ====================`);
    console.log(`[Stage 1] Creating Test Reminder for 1 minute from now (${testTime})...`);

    try {
      await axios.post(`${API_BASE}/api/reminders`, {
        medicine_name: "Test Medication",
        dosage: "500 mg",
        frequency: "once_daily",
        times: [testTime],
        start_date: todayStr,
        end_date: null,
        instructions: "Take with water for testing notification flow",
        notes: "Created via Test Reminder mode"
      });

      console.log(`[Stage 2] Saved to SQLite database via backend API.`);
      console.log(`[Stage 3] Real-time scheduler armed. Waiting for ${testTime}...`);

      fetchReminders();
      fetchDateSchedule(selectedDate);
      showToast(`Test reminder created for ${testTime} (1 min from now). Keep tab open!`, "success");
    } catch (err) {
      console.error("[Test Mode Error]", err);
      showToast("Failed to create test reminder.", "error");
    }
  };

  // Toast Notification helper
  const showToast = (message, type = "success") => {
    setToast({ message, type });
    setTimeout(() => {
      setToast(null);
    }, 4500);
  };

  // Helper date and time functions
  function getTodayDateString() {
    const d = new Date();
    const month = "" + (d.getMonth() + 1);
    const day = "" + d.getDate();
    const year = d.getFullYear();
    return [year, month.padStart(2, "0"), day.padStart(2, "0")].join("-");
  }

  function getCurrentTimeString() {
    const d = new Date();
    const hours = "" + d.getHours();
    const minutes = "" + d.getMinutes();
    return [hours.padStart(2, "0"), minutes.padStart(2, "0")].join(":");
  }

  const getWeekDates = () => {
    const current = new Date();
    const week = [];
    const currentDay = current.getDay();
    const distanceToMonday = currentDay === 0 ? -6 : 1 - currentDay;
    const monday = new Date(current);
    monday.setDate(current.getDate() + distanceToMonday);

    for (let i = 0; i < 7; i++) {
      const nextDay = new Date(monday);
      nextDay.setDate(monday.getDate() + i);
      week.push(nextDay);
    }
    return week;
  };

  const fetchDateSchedule = async (dateStr) => {
    if (!token) return;
    try {
      const todayStr = getTodayDateString();
      let queryTime = getCurrentTimeString();
      
      if (dateStr < todayStr) {
        queryTime = "23:59";
      } else if (dateStr > todayStr) {
        queryTime = "00:00";
      }

      const res = await axios.get(
        `${API_BASE}/api/schedule/today?date=${dateStr}&time=${queryTime}`
      );
      setDateSchedule(res.data);
    } catch (err) {
      console.error("Failed to fetch schedule:", err);
    }
  };

  const fetchReminders = async () => {
    if (!token) return;
    try {
      const res = await axios.get(`${API_BASE}/api/reminders`);
      setReminders(res.data);
    } catch (err) {
      console.error("Failed to fetch reminders:", err);
    }
  };

  const fetchAvailableDrugs = async () => {
    if (!token) return;
    try {
      const res = await axios.get(`${API_BASE}/api/drugs/search`);
      setAvailableDrugs(res.data.drugs || []);
    } catch (err) {
      console.error("Failed to fetch available medications:", err);
    }
  };

  const fetchUserProfile = async () => {
    try {
      const res = await axios.get(`${API_BASE}/api/auth/me`);
      setUser(res.data);
      setProfileForm(prev => ({
        ...prev,
        full_name: res.data.full_name
      }));
    } catch (err) {
      console.error("Failed to fetch user profile:", err);
      logout();
    }
  };

  const handleAuthSubmit = async (e) => {
    e.preventDefault();
    setAuthError("");
    setAuthLoading(true);

    if (authMode === "signup") {
      if (authForm.password !== authForm.confirmPassword) {
        setAuthError("Passwords do not match.");
        setAuthLoading(false);
        return;
      }
      if (!isPasswordValid(authForm.password)) {
        setAuthError("Password does not meet validation criteria.");
        setAuthLoading(false);
        return;
      }

      try {
        const res = await axios.post(`${API_BASE}/api/auth/signup`, {
          email: authForm.email,
          password: authForm.password,
          full_name: authForm.fullName
        });
        setToken(res.data.access_token);
        showToast(`Welcome to MediRAG, ${res.data.user.full_name}!`);
        setActiveTab("dashboard");
      } catch (err) {
        setAuthError(err.response?.data?.detail || "Registration failed. Try again.");
      }
    } else {
      try {
        const res = await axios.post(`${API_BASE}/api/auth/login`, {
          email: authForm.email,
          password: authForm.password
        });
        setToken(res.data.access_token);
        showToast("Logged in successfully!");
        setActiveTab("dashboard");
      } catch (err) {
        setAuthError(err.response?.data?.detail || "Incorrect email or password.");
      }
    }
    setAuthLoading(false);
  };

  const logout = () => {
    setToken(null);
    localStorage.removeItem("token");
    setUser(null);
    showToast("Logged out successfully.");
    setActiveTab("home");
  };

  const handleProfileSubmit = async (e) => {
    e.preventDefault();
    setProfileError("");
    setProfileSuccess("");

    if (profileForm.new_password) {
      if (profileForm.new_password !== profileForm.confirm_new_password) {
        setProfileError("New passwords do not match.");
        return;
      }
      if (!isPasswordValid(profileForm.new_password)) {
        setProfileError("Password must be at least 8 characters long, contain an uppercase letter, a lowercase letter, and a number.");
        return;
      }
    }

    try {
      const res = await axios.put(`${API_BASE}/api/auth/profile`, {
        full_name: profileForm.full_name,
        current_password: profileForm.current_password || null,
        new_password: profileForm.new_password || null
      });
      setUser(res.data);
      setProfileForm({
        ...profileForm,
        current_password: "",
        new_password: "",
        confirm_new_password: ""
      });
      showToast("Profile updated successfully!");
      setProfileSuccess("Profile information updated successfully.");
    } catch (err) {
      setProfileError(err.response?.data?.detail || "Failed to update profile.");
    }
  };

  const isPasswordValid = (pwd) => {
    return pwd.length >= 8 && /[A-Z]/.test(pwd) && /[a-z]/.test(pwd) && /[0-9]/.test(pwd);
  };

  const handleToggleReminder = async (id) => {
    try {
      await axios.put(`${API_BASE}/api/reminders/${id}/toggle`);
      fetchReminders();
      fetchDateSchedule(selectedDate);
      showToast("Medication status toggled.");
    } catch (err) {
      console.error("Failed to toggle reminder:", err);
      showToast("Error updating reminder status.", "error");
    }
  };

  const handleLogOccurrence = async (reminderId, time, status) => {
    try {
      await axios.post(`${API_BASE}/api/schedule/log`, {
        reminder_id: reminderId,
        date: selectedDate,
        time: time,
        status: status,
      });
      fetchDateSchedule(selectedDate);
      showToast(`Medication logged as ${status}.`);
    } catch (err) {
      console.error("Failed to log occurrence:", err);
      showToast("Error logging medication.", "error");
    }
  };

  const handleDeleteReminder = async (id) => {
    if (!window.confirm("Are you sure you want to delete this medication reminder?")) return;
    try {
      await axios.delete(`${API_BASE}/api/reminders/${id}`);
      fetchReminders();
      fetchDateSchedule(selectedDate);
      showToast("Medication reminder deleted.");
    } catch (err) {
      console.error("Failed to delete reminder:", err);
      showToast("Error deleting reminder.", "error");
    }
  };

  const openAddDrawer = (prefilled = {}) => {
    setEditingReminderId(null);
    setReminderForm({
      medicine_name: prefilled.medicine_name || "",
      dosage: prefilled.dosage || "",
      frequency: "once_daily",
      times: ["08:00"],
      start_date: getTodayDateString(),
      end_date: "",
      instructions: prefilled.instructions || "",
      notes: "",
    });
    setShowDrawer(true);
  };

  const openEditDrawer = (reminder) => {
    setEditingReminderId(reminder.id);
    setReminderForm({
      medicine_name: reminder.medicine_name,
      dosage: reminder.dosage,
      frequency: reminder.frequency,
      times: reminder.times.split(","),
      start_date: reminder.start_date,
      end_date: reminder.end_date || "",
      instructions: reminder.instructions || "",
      notes: reminder.notes || "",
    });
    setShowDrawer(true);
  };

  const handleFormChange = (key, value) => {
    setReminderForm((prev) => {
      const updated = { ...prev, [key]: value };
      if (key === "frequency") {
        if (value === "once_daily") updated.times = ["08:00"];
        else if (value === "twice_daily") updated.times = ["08:00", "20:00"];
        else if (value === "three_times_daily") updated.times = ["08:00", "14:00", "20:00"];
      }
      return updated;
    });
  };

  const handleTimeChange = (index, value) => {
    const newTimes = [...reminderForm.times];
    newTimes[index] = value;
    setReminderForm((prev) => ({ ...prev, times: newTimes }));
  };

  const addCustomTime = () => {
    setReminderForm((prev) => ({
      ...prev,
      times: [...prev.times, "12:00"],
    }));
  };

  const removeCustomTime = (index) => {
    if (reminderForm.times.length <= 1) return;
    const newTimes = reminderForm.times.filter((_, idx) => idx !== index);
    setReminderForm((prev) => ({ ...prev, times: newTimes }));
  };

  const handleReminderSubmit = async (e) => {
    e.preventDefault();

    if (!reminderForm.medicine_name.trim() || !reminderForm.dosage.trim()) {
      showToast("Please enter medication name and dosage.", "error");
      return;
    }

    try {
      if (editingReminderId) {
        await axios.put(`${API_BASE}/api/reminders/${editingReminderId}`, {
          medicine_name: reminderForm.medicine_name,
          dosage: reminderForm.dosage,
          frequency: reminderForm.frequency,
          times: reminderForm.times,
          start_date: reminderForm.start_date,
          end_date: reminderForm.end_date || null,
          instructions: reminderForm.instructions || null,
          notes: reminderForm.notes || null,
        });
        showToast("Medication schedule updated.");
      } else {
        await axios.post(`${API_BASE}/api/reminders`, {
          medicine_name: reminderForm.medicine_name,
          dosage: reminderForm.dosage,
          frequency: reminderForm.frequency,
          times: reminderForm.times,
          start_date: reminderForm.start_date,
          end_date: reminderForm.end_date || null,
          instructions: reminderForm.instructions || null,
          notes: reminderForm.notes || null,
        });
        showToast("Medication schedule created.");
      }
      setShowDrawer(false);
      fetchReminders();
      fetchDateSchedule(selectedDate);
    } catch (err) {
      console.error(err);
      showToast("Failed to save medication reminder.", "error");
    }
  };

  const activeTodaySchedule = dateSchedule.filter(t => t.status !== "disabled");
  const totalToday = activeTodaySchedule.length;
  const takenToday = activeTodaySchedule.filter(t => t.status === "taken").length;
  const skippedToday = activeTodaySchedule.filter(t => t.status === "skipped").length;
  const missedToday = activeTodaySchedule.filter(t => t.status === "missed").length;
  const upcomingToday = activeTodaySchedule.filter(t => t.status === "upcoming").length;
  const completionPercent = totalToday > 0 ? Math.round((takenToday / totalToday) * 100) : 0;

  const calculateNextReminder = () => {
    const todayStr = getTodayDateString();
    if (selectedDate !== todayStr) {
      setNextReminder(null);
      setCountdownText("");
      return;
    }

    const upcomingList = dateSchedule.filter(item => item.status === "upcoming" && item.is_enabled);
    if (upcomingList.length === 0) {
      setNextReminder(null);
      setCountdownText("");
      return;
    }

    const now = new Date();
    let minDiff = Infinity;
    let closestItem = null;

    upcomingList.forEach(item => {
      const [hrs, mins] = item.time.split(":").map(Number);
      const scheduledDateTime = new Date();
      scheduledDateTime.setHours(hrs, mins, 0, 0);

      const diff = scheduledDateTime - now;
      if (diff > 0 && diff < minDiff) {
        minDiff = diff;
        closestItem = item;
      }
    });

    if (closestItem) {
      setNextReminder(closestItem);
      const hrsDiff = Math.floor(minDiff / 3600000);
      const minsDiff = Math.floor((minDiff % 3600000) / 60000);
      
      let text = "";
      if (hrsDiff > 0) {
        text += `${hrsDiff}h `;
      }
      text += `${minsDiff}m`;
      setCountdownText(text);
    } else {
      setNextReminder(null);
      setCountdownText("");
    }
  };

  const getGreeting = () => {
    const hrs = new Date().getHours();
    if (hrs < 12) return "Good morning";
    if (hrs < 18) return "Good afternoon";
    return "Good evening";
  };

  const handleDrugNameChange = (val) => {
    setDrugName(val);
    if (!val.trim()) {
      setDrugSuggestions([]);
      setShowSuggestions(false);
      return;
    }
    const filtered = availableDrugs.filter((drug) =>
      drug.toLowerCase().includes(val.toLowerCase())
    );
    setDrugSuggestions(filtered);
    setShowSuggestions(true);
  };

  const selectDrugSuggestion = (selectedDrug) => {
    setDrugName(selectedDrug);
    setDrugSuggestions([]);
    setShowSuggestions(false);
  };

  const handleSendMessage = async (e, customDrug = null, customQuestion = null) => {
    if (e) e.preventDefault();

    const activeDrug = customDrug !== null ? customDrug : drugName;
    const activeQuestion = customQuestion !== null ? customQuestion : question;

    if (!activeQuestion.trim()) return;

    const userMsgText = activeDrug.trim()
      ? `[Drug: ${activeDrug.trim()}] ${activeQuestion}`
      : activeQuestion;

    const userMsg = {
      sender: "user",
      text: userMsgText,
    };

    setChatMessages((prev) => [...prev, userMsg]);
    setLoadingChat(true);
    setChatError("");
    setQuestion("");

    try {
      const res = await axios.post(`${API_BASE}/api/chat`, {
        question: activeQuestion,
        drug: activeDrug.trim() ? activeDrug.trim() : undefined,
      });

      const aiMsg = {
        sender: "ai",
        text: res.data.answer,
        drug: activeDrug.trim() ? activeDrug.trim() : undefined,
        sources: res.data.sources,
      };

      setChatMessages((prev) => [...prev, aiMsg]);
    } catch (err) {
      console.error(err);
      const errMsg =
        err.response?.data?.detail ||
        "Could not retrieve medication information. Check backend connectivity.";
      setChatError(errMsg);
      setChatMessages((prev) => [
        ...prev,
        {
          sender: "ai",
          text: `⚠️ Error: ${errMsg}`,
          isError: true,
        },
      ]);
    } finally {
      setLoadingChat(false);
    }
  };

  const handleSuggestedClick = (suggested) => {
    setDrugName(suggested.drug);
    setQuestion(suggested.question);
    setActiveTab("assistant");
    handleSendMessage(null, suggested.drug, suggested.question);
  };

  const handleClearInputs = () => {
    setDrugName("");
    setQuestion("");
    setDrugSuggestions([]);
    setShowSuggestions(false);
  };

  const [quickSearchQuery, setQuickSearchQuery] = useState("");
  const handleQuickSearchSubmit = (e) => {
    e.preventDefault();
    if (!quickSearchQuery.trim()) return;
    
    setQuestion(quickSearchQuery);
    setDrugName("");
    setActiveTab("assistant");
    handleSendMessage(null, "", quickSearchQuery);
    setQuickSearchQuery("");
  };

  const getUserInitials = () => {
    if (!user || !user.full_name) return "U";
    return user.full_name
      .split(" ")
      .map(part => part.charAt(0))
      .slice(0, 2)
      .join("")
      .toUpperCase();
  };

  // Helper renderer for Markdown headers, bullet points, and highlighted medical terms
  const renderFormattedAnswer = (text) => {
    if (!text) return null;
    
    const lines = text.split("\n");
    const elements = [];
    let listItems = [];
    
    const flushList = (keyPrefix) => {
      if (listItems.length > 0) {
        elements.push(
          <ul key={`${keyPrefix}-list`} className="formatted-answer-ul">
            {listItems.map((item, idx) => (
              <li key={idx} className="formatted-answer-li">
                <span className="bullet-dot">•</span>
                <span>{highlightMedicalTerms(item)}</span>
              </li>
            ))}
          </ul>
        );
        listItems = [];
      }
    };

    lines.forEach((line, idx) => {
      const trimmed = line.trim();
      if (!trimmed) {
        flushList(idx);
        return;
      }

      if (trimmed.startsWith("### ") || trimmed.startsWith("## ") || trimmed.startsWith("# ")) {
        flushList(idx);
        const headingText = trimmed.replace(/^#+\s*/, "");
        const isSerious = headingText.toLowerCase().includes("serious");
        const isWarning = headingText.toLowerCase().includes("warning");
        
        elements.push(
          <h4 key={idx} className={`formatted-heading ${isSerious ? "serious-heading" : isWarning ? "warning-heading" : "standard-heading"}`}>
            {isSerious ? <ShieldAlert size={16} className="heading-icon text-coral" /> : 
             isWarning ? <AlertTriangle size={16} className="heading-icon text-amber" /> : 
             <ShieldCheck size={16} className="heading-icon text-teal" />}
            {headingText}
          </h4>
        );
      } else if (trimmed.startsWith("•") || trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
        const bulletContent = trimmed.replace(/^[•\-\*]\s*/, "");
        listItems.push(bulletContent);
      } else {
        flushList(idx);
        elements.push(
          <p key={idx} className="formatted-answer-p">
            {highlightMedicalTerms(trimmed)}
          </p>
        );
      }
    });
    
    flushList("end");
    return <div className="formatted-answer-container">{elements}</div>;
  };

  const highlightMedicalTerms = (text) => {
    const parts = text.split(/(\*\*.*?\*\*)/g);
    return parts.map((part, i) => {
      if (part.startsWith("**") && part.endsWith("**")) {
        const sub = part.slice(2, -2);
        return <strong key={i} className="highlighted-term">{sub}</strong>;
      }
      return part;
    });
  };

  const [dropdownOpen, setDropdownOpen] = useState(false);

  return (
    <div className="app-container">
      {/* Decorative Background Orbs */}
      <div className="ambient-bg">
        <div className="ambient-orb orb-1"></div>
        <div className="ambient-orb orb-2"></div>
        <div className="ambient-orb orb-3"></div>
      </div>

      {/* Toast Notification Box */}
      {toast && (
        <div className={`toast-notification ${toast.type}`}>
          {toast.type === "success" ? <CheckCircle2 size={18} className="text-mint" /> : <AlertTriangle size={18} className="text-coral" />}
          <span>{toast.message}</span>
        </div>
      )}

      {/* Sticky Header Navbar */}
      <header className="navbar">
        <div className="nav-brand" onClick={() => setActiveTab("home")}>
          <MediRagLogo size={28} />
          <span className="brand-name">MediRAG</span>
        </div>

        {/* Desktop Navigation Links */}
        <nav className="nav-links">
          <button className={`nav-link ${activeTab === "home" ? "active" : ""}`} onClick={() => setActiveTab("home")}>
            Home
          </button>
          {token && (
            <>
              <button className={`nav-link ${activeTab === "dashboard" ? "active" : ""}`} onClick={() => setActiveTab("dashboard")}>
                Dashboard
              </button>
              <button className={`nav-link ${activeTab === "assistant" ? "active" : ""}`} onClick={() => setActiveTab("assistant")}>
                Ask AI
              </button>
              <button className={`nav-link ${activeTab === "reminders" ? "active" : ""}`} onClick={() => setActiveTab("reminders")}>
                My Reminders
              </button>
              <button className={`nav-link ${activeTab === "profile" ? "active" : ""}`} onClick={() => setActiveTab("profile")}>
                Profile
              </button>
            </>
          )}
        </nav>

        {/* Header Actions */}
        <div className="nav-actions">
          <button 
            className="theme-toggle-btn" 
            onClick={() => setTheme(prev => prev === "light" ? "dark" : "light")}
            aria-label="Toggle Theme"
          >
            {theme === "light" ? <Moon size={18} /> : <Sun size={18} />}
          </button>

          {token ? (
            <div className="user-menu-container">
              <button className="avatar-btn" onClick={() => setDropdownOpen(!dropdownOpen)}>
                {getUserInitials()}
              </button>
              {dropdownOpen && (
                <div className="user-dropdown">
                  <div className="dropdown-header">
                    <div className="dropdown-name">{user?.full_name || "User"}</div>
                    <div className="dropdown-email">{user?.email || ""}</div>
                  </div>
                  <button className="dropdown-item" onClick={() => { setActiveTab("dashboard"); setDropdownOpen(false); }}>
                    <LayoutDashboard size={16} /> Dashboard
                  </button>
                  <button className="dropdown-item" onClick={() => { setActiveTab("reminders"); setDropdownOpen(false); }}>
                    <CalendarIcon size={16} /> My Reminders
                  </button>
                  <button className="dropdown-item" onClick={() => { setActiveTab("profile"); setDropdownOpen(false); }}>
                    <User size={16} /> Profile Settings
                  </button>
                  <button className="dropdown-item logout" onClick={() => { logout(); setDropdownOpen(false); }}>
                    <LogOut size={16} /> Logout
                  </button>
                </div>
              )}
            </div>
          ) : (
            <button className="btn btn-primary" onClick={() => { setAuthMode("login"); setActiveTab("auth"); }}>
              Get Started
            </button>
          )}

          <button className="mobile-menu-btn" onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>
            {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>

        {mobileMenuOpen && (
          <nav className="nav-links mobile-open">
            <button className="nav-link" onClick={() => { setActiveTab("home"); setMobileMenuOpen(false); }}>Home</button>
            {token ? (
              <>
                <button className="nav-link" onClick={() => { setActiveTab("dashboard"); setMobileMenuOpen(false); }}>Dashboard</button>
                <button className="nav-link" onClick={() => { setActiveTab("assistant"); setMobileMenuOpen(false); }}>Ask AI</button>
                <button className="nav-link" onClick={() => { setActiveTab("reminders"); setMobileMenuOpen(false); }}>My Reminders</button>
                <button className="nav-link" onClick={() => { setActiveTab("profile"); setMobileMenuOpen(false); }}>Profile</button>
                <button className="nav-link" style={{ color: "var(--brand-coral)" }} onClick={() => { logout(); setMobileMenuOpen(false); }}>Logout</button>
              </>
            ) : (
              <button className="nav-link" onClick={() => { setAuthMode("login"); setActiveTab("auth"); setMobileMenuOpen(false); }}>Login</button>
            )}
          </nav>
        )}
      </header>

      {/* Main Content Viewport */}
      <main className="main-content">
        
        {/* ============================================================== */}
        {/* LANDING PAGE                                                   */}
        {/* ============================================================== */}
        {activeTab === "home" && (
          <div className="fade-in-up">
            <section className="landing-hero">
              <div className="hero-text-block">
                <div className="hero-badge">
                  <ShieldCheck size={16} />
                  <span>FDA-Grounded Information Assistant</span>
                </div>
                <h1 className="hero-title">
                  MediRAG<br />
                  <span className="text-teal">Your Intelligent Medication Companion</span>
                </h1>
                <p className="hero-subtitle">
                  Understand your medications with AI-powered, source-grounded FDA information and stay on track with reliable medication reminders.
                </p>
                <div className="hero-ctas">
                  {token ? (
                    <button className="btn btn-primary" onClick={() => setActiveTab("dashboard")}>
                      Go to Dashboard <ArrowRight size={18} />
                    </button>
                  ) : (
                    <>
                      <button className="btn btn-primary" onClick={() => { setAuthMode("login"); setActiveTab("auth"); }}>
                        Get Started <ArrowRight size={18} />
                      </button>
                      <button className="btn btn-secondary" onClick={() => { setAuthMode("signup"); setActiveTab("auth"); }}>
                        Sign Up
                      </button>
                    </>
                  )}
                </div>
              </div>

              <div className="hero-visual">
                <div className="visual-container">
                  <div className="mock-card card-fda">
                    <span className="mock-badge"><ShieldCheck size={12} /> FDA Verified</span>
                    <span className="mock-title">Amoxicillin</span>
                    <span className="mock-text">"Grounded directly in official drug label databases..."</span>
                  </div>
                  
                  <div className="mock-card card-reminder">
                    <span className="mock-badge" style={{ background: "var(--brand-aqua-light)", color: "var(--brand-aqua)" }}>
                      <Clock size={12} /> Upcoming
                    </span>
                    <span className="mock-title">Metformin 500mg</span>
                    <span className="mock-time">08:00 AM</span>
                  </div>

                  <div className="mock-card card-chat">
                    <span className="mock-badge" style={{ background: "var(--brand-mint-light)", color: "var(--brand-mint)" }}>
                      <MediRagLogo size={14} /> Assistant
                    </span>
                    <span className="mock-title">Side effects & warnings</span>
                    <span className="mock-text">Retrieving safety section chunks...</span>
                  </div>
                </div>
              </div>
            </section>

            {/* Features Grid */}
            <section className="features-section">
              <div className="section-header">
                <h2 className="section-title">How MediRAG Helps You</h2>
                <p className="section-desc">Vector indexing of official FDA drug label registries guarantees trusted, hallucination-free guidance.</p>
              </div>

              <div className="features-grid">
                <div className="feature-card">
                  <div className="feature-icon-wrapper">
                    <MessageSquare size={24} />
                  </div>
                  <h3>Ask About Medicines</h3>
                  <p>Get easy-to-understand medication answers formatted with bullet points and clear headers.</p>
                </div>

                <div className="feature-card">
                  <div className="feature-icon-wrapper">
                    <Bookmark size={24} />
                  </div>
                  <h3>View Reliable Sources</h3>
                  <p>Inspect exact FDA label sections and chunks used by the AI to generate each answer.</p>
                </div>

                <div className="feature-card">
                  <div className="feature-icon-wrapper">
                    <Bell size={24} />
                  </div>
                  <h3>Never Miss a Reminder</h3>
                  <p>Receive desktop browser notifications and in-app alerts when medications are due.</p>
                </div>
              </div>
            </section>
          </div>
        )}

        {/* ============================================================== */}
        {/* AUTHENTICATION PAGE                                            */}
        {/* ============================================================== */}
        {activeTab === "auth" && (
          <div className="auth-container fade-in-up">
            <div className="auth-left-pane">
              <div className="auth-benefits-block">
                <div className="auth-hero-branding">
                  <MediRagLogo size={34} />
                  <span className="auth-logo-name">MediRAG</span>
                </div>
                <h2 className="auth-left-heading">
                  Understand your medications. <span>Stay on schedule.</span> Feel informed.
                </h2>
                <div className="auth-benefits-list">
                  <div className="auth-benefit-item">
                    <div className="benefit-icon-box">
                      <ShieldCheck size={18} />
                    </div>
                    <div>
                      <h4 className="benefit-title">FDA label grounding</h4>
                      <p className="benefit-desc">Answers are extracted strictly from official FDA databases without hallucinations.</p>
                    </div>
                  </div>

                  <div className="auth-benefit-item">
                    <div className="benefit-icon-box">
                      <Clock size={18} />
                    </div>
                    <div>
                      <h4 className="benefit-title">Smart reminder scheduler</h4>
                      <p className="benefit-desc">Set custom prescription timetables and receive real-time notifications.</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="auth-right-pane">
              <div className="auth-form-card">
                <div className="auth-card-header">
                  <h3 className="auth-card-title">{authMode === "login" ? "Welcome Back" : "Create Account"}</h3>
                  <p className="auth-card-desc">
                    {authMode === "login" ? "Access your personal medication assistant" : "Register to track medication reminders"}
                  </p>
                </div>

                {authError && (
                  <div className="alert-error">
                    <AlertTriangle size={16} />
                    <span>{authError}</span>
                  </div>
                )}

                <form onSubmit={handleAuthSubmit} className="auth-form">
                  {authMode === "signup" && (
                    <div className="form-group">
                      <label htmlFor="fullname">Full Name</label>
                      <div className="input-wrapper">
                        <User className="input-icon-left" size={16} />
                        <input
                          id="fullname"
                          type="text"
                          className="auth-input"
                          placeholder="John Doe"
                          value={authForm.fullName}
                          onChange={(e) => setAuthForm({ ...authForm, fullName: e.target.value })}
                          required
                        />
                      </div>
                    </div>
                  )}

                  <div className="form-group">
                    <label htmlFor="email">Email Address</label>
                    <div className="input-wrapper">
                      <Mail className="input-icon-left" size={16} />
                      <input
                        id="email"
                        type="email"
                        className="auth-input"
                        placeholder="you@example.com"
                        value={authForm.email}
                        onChange={(e) => setAuthForm({ ...authForm, email: e.target.value })}
                        required
                      />
                    </div>
                  </div>

                  <div className="form-group">
                    <label htmlFor="password">Password</label>
                    <div className="input-wrapper">
                      <Lock className="input-icon-left" size={16} />
                      <input
                        id="password"
                        type={showPassword ? "text" : "password"}
                        className="auth-input"
                        placeholder="••••••••"
                        value={authForm.password}
                        onChange={(e) => setAuthForm({ ...authForm, password: e.target.value })}
                        required
                      />
                      <button
                        type="button"
                        className="input-password-toggle"
                        onClick={() => setShowPassword(!showPassword)}
                      >
                        {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </div>

                  {authMode === "signup" && (
                    <>
                      <div className="password-validation-grid">
                        <div className={`validation-rule ${authForm.password.length >= 8 ? "valid" : "invalid"}`}>
                          {authForm.password.length >= 8 ? <Check size={10} /> : <Info size={10} />}
                          <span>Min 8 chars</span>
                        </div>
                        <div className={`validation-rule ${/[A-Z]/.test(authForm.password) ? "valid" : "invalid"}`}>
                          {/[A-Z]/.test(authForm.password) ? <Check size={10} /> : <Info size={10} />}
                          <span>1 Uppercase</span>
                        </div>
                        <div className={`validation-rule ${/[a-z]/.test(authForm.password) ? "valid" : "invalid"}`}>
                          {/[a-z]/.test(authForm.password) ? <Check size={10} /> : <Info size={10} />}
                          <span>1 Lowercase</span>
                        </div>
                        <div className={`validation-rule ${/[0-9]/.test(authForm.password) ? "valid" : "invalid"}`}>
                          {/[0-9]/.test(authForm.password) ? <Check size={10} /> : <Info size={10} />}
                          <span>1 Number</span>
                        </div>
                      </div>

                      <div className="form-group">
                        <label htmlFor="confirmPassword">Confirm Password</label>
                        <div className="input-wrapper">
                          <Lock className="input-icon-left" size={16} />
                          <input
                            id="confirmPassword"
                            type={showPassword ? "text" : "password"}
                            className="auth-input"
                            placeholder="••••••••"
                            value={authForm.confirmPassword}
                            onChange={(e) => setAuthForm({ ...authForm, confirmPassword: e.target.value })}
                            required
                          />
                        </div>
                      </div>
                    </>
                  )}

                  <button type="submit" className="btn btn-primary btn-auth" disabled={authLoading}>
                    {authLoading ? "Verifying..." : authMode === "login" ? "Login" : "Sign Up"}
                  </button>
                </form>

                <div className="auth-switch-prompt">
                  {authMode === "login" ? "Don't have an account?" : "Already registered?"}{" "}
                  <button
                    className="auth-switch-btn"
                    onClick={() => {
                      setAuthMode(authMode === "login" ? "signup" : "login");
                      setAuthError("");
                    }}
                  >
                    {authMode === "login" ? "Create one here" : "Sign in here"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ============================================================== */}
        {/* RESTRUCTURED 6-SECTION USER PROFILE WORKSPACE                  */}
        {/* ============================================================== */}
        {activeTab === "profile" && token && (
          <div className="profile-container fade-in-up" style={{ maxWidth: "800px", margin: "0 auto", padding: "1rem" }}>
            
            {/* 1. PROFILE HEADER */}
            <div className="profile-card profile-header-card" style={{ marginBottom: "1.5rem" }}>
              <div className="profile-avatar-large-container">
                <div className="profile-avatar-large">{getUserInitials()}</div>
                <div>
                  <h2 style={{ fontSize: "1.5rem", fontWeight: "700" }}>{user?.full_name}</h2>
                  <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem" }}>{user?.email}</p>
                  <span className="badge-member-since" style={{ fontSize: "0.8rem", color: "var(--brand-teal)", background: "var(--brand-teal-light)", padding: "0.2rem 0.6rem", borderRadius: "1rem", marginTop: "0.4rem", display: "inline-block" }}>
                    Member since: {user?.created_at ? new Date(user.created_at).toLocaleDateString() : "2026"}
                  </span>
                </div>
              </div>
            </div>

            {profileError && (
              <div className="alert-error" style={{ marginBottom: "1rem" }}>
                <AlertTriangle size={16} />
                <span>{profileError}</span>
              </div>
            )}
            {profileSuccess && (
              <div className="toast-notification success" style={{ position: "relative", bottom: 0, left: 0, width: "100%", marginBottom: "1rem" }}>
                <CheckCircle2 size={16} className="text-mint" />
                <span>{profileSuccess}</span>
              </div>
            )}

            {/* 2. ACCOUNT INFORMATION & EDIT NAME */}
            <div className="profile-card" style={{ marginBottom: "1.5rem" }}>
              <h3 className="profile-section-title">
                <User size={18} className="text-teal" /> Account Information
              </h3>
              <form onSubmit={handleProfileSubmit} className="profile-form-section">
                <div className="form-group">
                  <label htmlFor="profileName">Full Name</label>
                  <div className="input-wrapper">
                    <User className="input-icon-left" size={16} />
                    <input
                      id="profileName"
                      type="text"
                      className="auth-input"
                      value={profileForm.full_name}
                      onChange={(e) => setProfileForm({ ...profileForm, full_name: e.target.value })}
                      required
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label htmlFor="profileEmail">Email Address</label>
                  <div className="input-wrapper">
                    <Mail className="input-icon-left" size={16} />
                    <input
                      id="profileEmail"
                      type="email"
                      className="auth-input"
                      value={user?.email || ""}
                      disabled
                      style={{ opacity: 0.7, cursor: "not-allowed" }}
                    />
                  </div>
                </div>

                <button type="submit" className="btn btn-primary btn-sm" style={{ width: "fit-content" }}>
                  Update Account Details
                </button>
              </form>
            </div>

            {/* 3. SECURITY & PASSWORD CHANGE */}
            <div className="profile-card" style={{ marginBottom: "1.5rem" }}>
              <h3 className="profile-section-title">
                <Lock size={18} className="text-teal" /> Security Settings
              </h3>
              <form onSubmit={handleProfileSubmit} className="profile-form-section">
                <div className="form-group">
                  <label htmlFor="currentPassword">Current Password</label>
                  <div className="input-wrapper">
                    <Lock className="input-icon-left" size={16} />
                    <input
                      id="currentPassword"
                      type="password"
                      className="auth-input"
                      placeholder="Enter current password"
                      value={profileForm.current_password}
                      onChange={(e) => setProfileForm({ ...profileForm, current_password: e.target.value })}
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label htmlFor="newPassword">New Password</label>
                  <div className="input-wrapper">
                    <Lock className="input-icon-left" size={16} />
                    <input
                      id="newPassword"
                      type="password"
                      className="auth-input"
                      placeholder="At least 8 characters long"
                      value={profileForm.new_password}
                      onChange={(e) => setProfileForm({ ...profileForm, new_password: e.target.value })}
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label htmlFor="confirmNewPassword">Confirm New Password</label>
                  <div className="input-wrapper">
                    <Lock className="input-icon-left" size={16} />
                    <input
                      id="confirmNewPassword"
                      type="password"
                      className="auth-input"
                      placeholder="Confirm new password"
                      value={profileForm.confirm_new_password}
                      onChange={(e) => setProfileForm({ ...profileForm, confirm_new_password: e.target.value })}
                    />
                  </div>
                </div>

                <button type="submit" className="btn btn-secondary btn-sm" style={{ width: "fit-content" }}>
                  Change Password
                </button>
              </form>
            </div>

            {/* 4. PREFERENCES & NOTIFICATION CONTROLS */}
            <div className="profile-card" style={{ marginBottom: "1.5rem" }}>
              <h3 className="profile-section-title">
                <Bell size={18} className="text-teal" /> Preferences & Notifications
              </h3>
              
              <div className="preference-item-row" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.75rem 0", borderBottom: "1px solid var(--border-color)" }}>
                <div>
                  <h4 style={{ fontSize: "0.95rem", fontWeight: "600" }}>Application Theme</h4>
                  <p style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>Choose your preferred color theme</p>
                </div>
                <div style={{ display: "flex", gap: "0.5rem" }}>
                  <button 
                    className={`btn btn-sm ${theme === "dark" ? "btn-primary" : "btn-secondary"}`}
                    onClick={() => setTheme("dark")}
                  >
                    <Moon size={14} /> Dark
                  </button>
                  <button 
                    className={`btn btn-sm ${theme === "light" ? "btn-primary" : "btn-secondary"}`}
                    onClick={() => setTheme("light")}
                  >
                    <Sun size={14} /> Light
                  </button>
                </div>
              </div>

              <div className="preference-item-row" style={{ padding: "0.75rem 0" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
                  <div>
                    <h4 style={{ fontSize: "0.95rem", fontWeight: "600" }}>Browser Desktop Notifications</h4>
                    <p style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>
                      Status: <strong className={notificationPermission === "granted" ? "text-mint" : "text-coral"}>
                        Notifications: {notificationPermission === "granted" ? "Enabled" : "Disabled"}
                      </strong>
                    </p>
                  </div>

                  <div style={{ display: "flex", gap: "0.5rem" }}>
                    {notificationPermission !== "granted" && (
                      <button className="btn btn-primary btn-sm" onClick={requestNotificationPermission}>
                        Enable Notifications
                      </button>
                    )}
                    <button className="btn btn-secondary btn-sm" onClick={sendTestNotification}>
                      Send Test Notification
                    </button>
                  </div>
                </div>

                <div style={{ background: "var(--bg-secondary)", padding: "0.75rem", borderRadius: "0.5rem", fontSize: "0.8rem", color: "var(--text-muted)", lineHeight: "1.4" }}>
                  <Info size={14} className="text-teal" style={{ verticalAlign: "middle", marginRight: "0.4rem" }} />
                  <strong>Browser Limitation Note:</strong> Desktop alerts require this web application tab to remain open in your browser. Reminders will not fire if the browser is closed or if operating system Do-Not-Disturb is active.
                </div>
              </div>
            </div>

            {/* 5. MEDICATION ACTIVITY SUMMARY (DYNAMIC STATS) */}
            <div className="profile-card" style={{ marginBottom: "1.5rem" }}>
              <h3 className="profile-section-title">
                <Activity size={18} className="text-teal" /> Medication Activity Summary
              </h3>
              
              <div className="summary-stat-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "1rem", marginTop: "0.75rem" }}>
                <div className="stat-card-box" style={{ background: "var(--bg-secondary)", padding: "1rem", borderRadius: "0.75rem", textAlign: "center" }}>
                  <span style={{ fontSize: "1.8rem", fontWeight: "800", color: "var(--brand-teal)", display: "block" }}>{reminders.filter(r => r.is_enabled).length}</span>
                  <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>Active Reminders</span>
                </div>
                <div className="stat-card-box" style={{ background: "var(--bg-secondary)", padding: "1rem", borderRadius: "0.75rem", textAlign: "center" }}>
                  <span style={{ fontSize: "1.8rem", fontWeight: "800", color: "var(--brand-mint)", display: "block" }}>{takenToday}</span>
                  <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>Taken Today</span>
                </div>
                <div className="stat-card-box" style={{ background: "var(--bg-secondary)", padding: "1rem", borderRadius: "0.75rem", textAlign: "center" }}>
                  <span style={{ fontSize: "1.8rem", fontWeight: "800", color: "var(--brand-amber)", display: "block" }}>{skippedToday}</span>
                  <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>Skipped Today</span>
                </div>
                <div className="stat-card-box" style={{ background: "var(--bg-secondary)", padding: "1rem", borderRadius: "0.75rem", textAlign: "center" }}>
                  <span style={{ fontSize: "1.8rem", fontWeight: "800", color: "var(--brand-aqua)", display: "block" }}>{upcomingToday}</span>
                  <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>Upcoming Doses</span>
                </div>
              </div>
            </div>

            {/* 6. ACCOUNT ACTIONS */}
            <div className="profile-card">
              <h3 className="profile-section-title">
                <LogOut size={18} className="text-coral" /> Account Actions
              </h3>
              <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)", marginBottom: "0.75rem" }}>
                Sign out of your MediRAG account on this device.
              </p>
              <button className="btn btn-secondary" style={{ color: "var(--brand-coral)", borderColor: "var(--brand-coral)" }} onClick={logout}>
                <LogOut size={16} /> Logout Account
              </button>
            </div>
          </div>
        )}

        {/* ============================================================== */}
        {/* DASHBOARD                                                      */}
        {/* ============================================================== */}
        {activeTab === "dashboard" && token && (
          <div className="fade-in-up">
            <div className="dashboard-header-bar">
              <h2 className="dashboard-title">{getGreeting()}, {user?.full_name?.split(" ")[0]}</h2>
              <p className="dashboard-subtitle">Here's your medication overview for today.</p>
            </div>

            <div className="dashboard-grid">
              <div className="dashboard-left">
                <div className="timeline-card">
                  <div className="card-title-bar">
                    <h3 className="card-heading">
                      <CalendarIcon size={20} className="text-teal" /> Today's Medication Timeline
                    </h3>
                  </div>

                  {activeTodaySchedule.length === 0 ? (
                    <div className="empty-state-card" style={{ padding: "2rem" }}>
                      <CalendarIcon className="empty-state-icon" />
                      <p>No medication schedules configured for today.</p>
                      <button className="btn btn-primary btn-sm" onClick={() => setActiveTab("reminders")} style={{ marginTop: "0.5rem" }}>
                        <Plus size={16} /> Add Reminder
                      </button>
                    </div>
                  ) : (
                    <div className="vertical-timeline">
                      {activeTodaySchedule.map((item, idx) => (
                        <div key={idx} className={`timeline-item ${item.status}`}>
                          <div className="timeline-marker"></div>
                          <div className="timeline-content-card">
                            <div className="timeline-details-left">
                              <span className="timeline-time-label">{item.time}</span>
                              <h4 className="timeline-med-title">{item.medicine_name}</h4>
                              <span className="timeline-med-dosage">{item.dosage}</span>
                              {item.instructions && (
                                <span className="timeline-med-instructions">
                                  <Info size={12} /> {item.instructions}
                                </span>
                              )}
                            </div>

                            <div className="timeline-actions-right">
                              {item.status === "taken" || item.status === "skipped" ? (
                                <span className={`status-badge-pill ${item.status}`}>{item.status}</span>
                              ) : (
                                <>
                                  <span className={`status-badge-pill ${item.status}`}>{item.status}</span>
                                  <button
                                    className="timeline-btn-action taken"
                                    onClick={() => handleLogOccurrence(item.reminder_id, item.time, "taken")}
                                  >
                                    <Check size={14} /> Log Taken
                                  </button>
                                  <button
                                    className="timeline-btn-action skipped"
                                    onClick={() => handleLogOccurrence(item.reminder_id, item.time, "skipped")}
                                  >
                                    <X size={14} /> Skip
                                  </button>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="quick-ai-card">
                  <h3 className="card-heading" style={{ fontSize: "1.15rem" }}>
                    <MediRagLogo size={20} /> Have a question about your medication?
                  </h3>
                  <form onSubmit={handleQuickSearchSubmit} className="quick-ai-input-row">
                    <input
                      type="text"
                      placeholder="Ask about side effects, warnings, interactions..."
                      value={quickSearchQuery}
                      onChange={(e) => setQuickSearchQuery(e.target.value)}
                    />
                    <button type="submit" className="btn btn-primary">
                      Consult AI
                    </button>
                  </form>
                </div>
              </div>

              <div className="dashboard-right">
                <div className="progress-radial-card">
                  <h3 className="card-heading">Daily Adherence Progress</h3>
                  <div className="radial-progress-svg-container">
                    <svg className="radial-progress-svg" viewBox="0 0 100 100">
                      <circle className="circle-track" cx="50" cy="50" r="40" />
                      <circle
                        className="circle-fill-bar"
                        cx="50"
                        cy="50"
                        r="40"
                        style={{
                          strokeDasharray: `${2 * Math.PI * 40}`,
                          strokeDashoffset: `${2 * Math.PI * 40 * (1 - completionPercent / 100)}`,
                        }}
                      />
                    </svg>
                    <div className="radial-progress-text">
                      <span className="progress-percent-val text-teal">{completionPercent}%</span>
                      <span className="progress-percent-desc">Adherence</span>
                    </div>
                  </div>

                  <div className="radial-stats-legend">
                    <div className="radial-legend-item">
                      <span className="radial-legend-num taken">{takenToday}</span>
                      <span className="radial-legend-label">Taken</span>
                    </div>
                    <div className="radial-legend-item">
                      <span className="radial-legend-num upcoming">{upcomingToday}</span>
                      <span className="radial-legend-label">Upcoming</span>
                    </div>
                    <div className="radial-legend-item">
                      <span className="radial-legend-num missed" style={{ color: "var(--brand-coral)" }}>{missedToday}</span>
                      <span className="radial-legend-label">Missed</span>
                    </div>
                  </div>
                </div>

                {nextReminder ? (
                  <div className="upcoming-highlight-card">
                    <div className="upcoming-header">
                      <Clock size={16} />
                      <span>Next Medication</span>
                    </div>
                    <div className="upcoming-countdown">
                      in {countdownText}
                    </div>
                    <div className="upcoming-med-details">
                      <div className="upcoming-med-info">
                        <h4>{nextReminder.medicine_name}</h4>
                        <p>{nextReminder.dosage}</p>
                      </div>
                      <span className="upcoming-time-tag">{nextReminder.time}</span>
                    </div>
                  </div>
                ) : (
                  <div className="upcoming-highlight-card" style={{ background: "var(--bg-secondary)", borderColor: "var(--border-color)" }}>
                    <div className="upcoming-header" style={{ color: "var(--text-secondary)" }}>
                      <Clock size={16} />
                      <span>No Upcoming Medication</span>
                    </div>
                    <p style={{ fontSize: "0.9rem", color: "var(--text-secondary)", marginTop: "0.5rem" }}>
                      All active reminders for today have been logged or have passed.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ============================================================== */}
        {/* AI MEDICATION ASSISTANT                                        */}
        {/* ============================================================== */}
        {activeTab === "assistant" && token && (
          <div className="assistant-layout-container fade-in-up">
            <div className="assistant-search-sidebar">
              <h3 className="card-heading">
                <MediRagLogo size={20} /> Consult Drug Label RAG
              </h3>
              <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)", lineHeight: "1.4" }}>
                Select a medication name and type your specific inquiry to verify grounded FDA drug label details.
              </p>

              <form onSubmit={handleSendMessage} className="assistant-form">
                <div className="form-group autocomplete-container">
                  <label htmlFor="medname">Medication Name (Optional)</label>
                  <div className="input-wrapper">
                    <Compass className="input-icon-left" size={16} />
                    <input
                      id="medname"
                      type="text"
                      className="auth-input"
                      placeholder="e.g. Amoxicillin, Ibuprofen"
                      value={drugName}
                      onChange={(e) => handleDrugNameChange(e.target.value)}
                      autoComplete="off"
                    />
                  </div>
                  
                  {showSuggestions && drugSuggestions.length > 0 && (
                    <ul className="autocomplete-suggestions-list">
                      {drugSuggestions.map((sug, idx) => (
                        <li 
                          key={idx} 
                          className="autocomplete-suggestion-item" 
                          onClick={() => selectDrugSuggestion(sug)}
                        >
                          {sug}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className="form-group">
                  <label htmlFor="query">Your Question</label>
                  <textarea
                    id="query"
                    className="assistant-textarea"
                    rows={4}
                    placeholder="e.g. What are the side effects of Amoxicillin? What are the warnings or storage instructions?"
                    value={question}
                    onChange={(e) => setQuestion(e.target.value)}
                    required
                  />
                </div>

                <div className="flex-row-gap">
                  <button type="button" className="btn btn-secondary flex-grow-1" onClick={handleClearInputs}>
                    Clear
                  </button>
                  <button type="submit" className="btn btn-primary flex-grow-1" disabled={loadingChat}>
                    {loadingChat ? "Querying..." : "Ask RAG"}
                  </button>
                </div>
              </form>

              {chatError && (
                <div className="alert-error" style={{ marginTop: "0.5rem" }}>
                  <AlertTriangle size={16} />
                  <span>{chatError}</span>
                </div>
              )}

              <div className="sidebar-suggestions-block">
                <span className="sidebar-suggestions-title">Suggested RAG Inquiries</span>
                <div className="suggestions-grid">
                  {SUGGESTED_QUESTIONS.map((sug, idx) => (
                    <div key={idx} className="suggestion-card-item" onClick={() => handleSuggestedClick(sug)}>
                      <div className="suggestion-card-header">
                        <span className="suggestion-drug-name">{sug.drug}</span>
                        <ArrowUpRight size={14} className="text-teal" />
                      </div>
                      <p className="suggestion-question-text">"{sug.question}"</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Chat Feed */}
            <div className="assistant-chat-panel">
              <div className="chat-panel-header">
                <div className="chat-panel-title">
                  <MessageSquare size={18} className="text-teal" />
                  <span>Consultation Feed</span>
                </div>
                <div className="chat-badge-verified">
                  <ShieldCheck size={14} /> Answer Grounded in FDA Labels
                </div>
              </div>

              <div className="chat-messages-container">
                {chatMessages.map((msg, index) => (
                  <div key={index} className={`chat-msg-row ${msg.sender}`}>
                    <div className="msg-bubble">
                      <div className="msg-meta-header">
                        {msg.sender === "ai" ? <MediRagLogo size={14} /> : <User size={12} />}
                        <span>{msg.sender === "ai" ? "MediRAG Assistant" : "You"}</span>
                      </div>
                      
                      {msg.sender === "ai" ? (
                        renderFormattedAnswer(msg.text)
                      ) : (
                        <div>{msg.text}</div>
                      )}

                      {msg.sender === "ai" && msg.drug && (
                        <div className="ai-actions-row">
                          <button
                            className="btn btn-secondary btn-sm"
                            style={{ width: "fit-content", padding: "0.4rem 0.8rem", fontSize: "0.85rem" }}
                            onClick={() => openAddDrawer({ medicine_name: msg.drug })}
                          >
                            <Plus size={14} /> Prefill Reminder for {msg.drug}
                          </button>
                        </div>
                      )}

                      {/* Display Sources Used directly */}
                      {msg.sender === "ai" && msg.sources && msg.sources.length > 0 && (
                        <div className="sources-used-section" style={{ marginTop: "1rem", paddingTop: "0.75rem", borderTop: "1px solid var(--border-color)" }}>
                          <h4 style={{ fontSize: "0.85rem", fontWeight: "700", color: "var(--text-secondary)", marginBottom: "0.5rem", display: "flex", alignItems: "center", gap: "0.4rem" }}>
                            <Bookmark size={14} className="text-teal" /> Sources used ({msg.sources.length})
                          </h4>
                          <div className="sources-used-grid" style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                            {msg.sources.map((src, sIdx) => {
                              const isOfficial = src.source_type === "official_fda" || 
                                (!src.source_type && (src.source || "").toLowerCase().includes("fda"));
                              return (
                                <div key={sIdx} className="source-card-box" style={{ background: "var(--bg-secondary)", padding: "0.6rem 0.8rem", borderRadius: "0.5rem", border: "1px solid var(--border-color)" }}>
                                  <div className="source-card-badges" style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap", marginBottom: "0.3rem" }}>
                                    <span className="source-badge drug" style={{ background: "var(--brand-teal-light)", color: "var(--brand-teal)", padding: "0.15rem 0.4rem", borderRadius: "0.3rem", fontSize: "0.75rem", fontWeight: "600" }}>{src.drug_name}</span>
                                    <span className="source-badge section" style={{ background: "var(--bg-primary)", color: "var(--text-secondary)", padding: "0.15rem 0.4rem", borderRadius: "0.3rem", fontSize: "0.75rem" }}>{src.section_name}</span>
                                    {isOfficial ? (
                                      <span className="source-badge source-type-official" style={{ background: "var(--brand-mint-light)", color: "var(--brand-mint)", padding: "0.15rem 0.4rem", borderRadius: "0.3rem", fontSize: "0.75rem", fontWeight: "600" }}>FDA Official</span>
                                    ) : (
                                      <span className="source-badge source-type-manual" style={{ background: "var(--brand-aqua-light)", color: "var(--brand-aqua)", padding: "0.15rem 0.4rem", borderRadius: "0.3rem", fontSize: "0.75rem" }}>Local Document</span>
                                    )}
                                  </div>
                                  <p className="source-card-excerpt" style={{ fontSize: "0.8rem", color: "var(--text-secondary)", fontStyle: "italic", margin: "0.2rem 0" }}>"{src.source_text.substring(0, 200)}..."</p>
                                  <div className="source-card-footer" style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "0.3rem" }}>
                                    <span>Source: {src.source}</span>
                                    {src.original_filename && <span> | File: {src.original_filename}</span>}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                {loadingChat && (
                  <div className="chat-msg-row ai">
                    <div className="msg-bubble">
                      <div className="msg-meta-header">
                        <MediRagLogo size={14} />
                        <span>MediRAG Assistant</span>
                      </div>
                      <div className="typing-dot-loader">
                        <div className="typing-dot"></div>
                        <div className="typing-dot"></div>
                        <div className="typing-dot"></div>
                      </div>
                      <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginTop: "0.2rem" }}>
                        Searching FDA vector database & generating grounded answer...
                      </p>
                    </div>
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>

              <div style={{ background: "var(--bg-secondary)", padding: "0.75rem 1.5rem", borderTop: "1px solid var(--border-color)", fontSize: "0.8rem", color: "var(--text-secondary)" }}>
                <strong>Safety Disclaimer:</strong> MediRAG provides medication information based on official FDA drug-label data for informational purposes only. It is not a substitute for professional medical advice.
              </div>
            </div>
          </div>
        )}

        {/* ============================================================== */}
        {/* CALENDAR REMINDERS & TEST MODE                                 */}
        {/* ============================================================== */}
        {activeTab === "reminders" && token && (
          <div className="fade-in-up">
            <div className="reminders-page-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "1rem" }}>
              <h2>Medication Timetable Scheduler</h2>
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <button className="btn btn-secondary" onClick={handleCreateTestReminder}>
                  <Clock size={16} /> Test Reminder (1 Min)
                </button>
                <button className="btn btn-primary" onClick={() => openAddDrawer()}>
                  <Plus size={18} /> Add Reminder
                </button>
              </div>
            </div>

            {/* Weekly Selector */}
            <div className="calendar-selector-card">
              <div className="calendar-meta-stats">
                <span className="calendar-date-title">
                  Week Schedule Overview
                </span>
                <div className="calendar-stats-row">
                  <span className="calendar-stat-pill" style={{ color: "var(--brand-mint)" }}>
                    <Check size={14} /> {takenToday} Taken
                  </span>
                  <span className="calendar-stat-pill" style={{ color: "var(--brand-aqua)" }}>
                    <Clock size={14} /> {upcomingToday} Remaining
                  </span>
                </div>
              </div>

              <div className="calendar-days-row">
                {getWeekDates().map((day, idx) => {
                  const dateString = day.toISOString().split("T")[0];
                  const isSelected = selectedDate === dateString;
                  const dayName = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][day.getDay()];
                  const dayNum = day.getDate();

                  return (
                    <button
                      key={idx}
                      className={`calendar-day-btn ${isSelected ? "selected" : ""}`}
                      onClick={() => setSelectedDate(dateString)}
                    >
                      <span className="day-btn-name">{dayName}</span>
                      <span className="day-btn-num">{dayNum}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="reminders-split-layout">
              <div className="reminders-list-column">
                <div className="column-header-box">
                  <h3 className="column-title">Scheduled Doses ({selectedDate})</h3>
                  <span className="column-count-badge">{activeTodaySchedule.length} active</span>
                </div>

                {activeTodaySchedule.length === 0 ? (
                  <div className="empty-state-card">
                    <CalendarIcon className="empty-state-icon" />
                    <p>No medication occurrences scheduled on this date.</p>
                  </div>
                ) : (
                  <div className="reminder-list-feed">
                    {activeTodaySchedule.map((item, idx) => (
                      <div key={idx} className="timeline-content-card" style={{ background: "var(--bg-card)" }}>
                        <div className="timeline-details-left">
                          <span className="timeline-time-label" style={{ color: "var(--brand-aqua)" }}>
                            {item.time}
                          </span>
                          <h4 className="timeline-med-title">{item.medicine_name}</h4>
                          <span className="timeline-med-dosage">{item.dosage}</span>
                          {item.instructions && (
                            <span className="timeline-med-instructions">
                              <Info size={12} /> {item.instructions}
                            </span>
                          )}
                        </div>

                        <div className="timeline-actions-right">
                          {item.status === "taken" || item.status === "skipped" ? (
                            <span className={`status-badge-pill ${item.status}`}>{item.status}</span>
                          ) : (
                            <>
                              <span className={`status-badge-pill ${item.status}`}>{item.status}</span>
                              <button
                                className="timeline-btn-action taken"
                                onClick={() => handleLogOccurrence(item.reminder_id, item.time, "taken")}
                              >
                                <Check size={14} /> Log Taken
                              </button>
                              <button
                                className="timeline-btn-action skipped"
                                onClick={() => handleLogOccurrence(item.reminder_id, item.time, "skipped")}
                              >
                                <X size={14} /> Skip
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="reminders-list-column">
                <div className="column-header-box">
                  <h3 className="column-title">Reminder Profiles</h3>
                  <span className="column-count-badge">{reminders.length} total</span>
                </div>

                {reminders.length === 0 ? (
                  <div className="empty-state-card">
                    <MediRagLogo className="empty-state-icon" size={32} />
                    <p>No configured medication templates.</p>
                  </div>
                ) : (
                  <div className="reminder-list-feed">
                    {reminders.map((reminder) => (
                      <div key={reminder.id} className={`config-med-card ${reminder.is_enabled ? "" : "disabled-template"}`}>
                        <div className="config-card-header">
                          <div className="config-med-info">
                            <h4>{reminder.medicine_name}</h4>
                            <p>{reminder.dosage}</p>
                          </div>
                          
                          <div className="switch-wrapper">
                            <span className="switch-label">{reminder.is_enabled ? "Active" : "Paused"}</span>
                            <label className="toggle-switch-slider">
                              <input
                                type="checkbox"
                                className="toggle-switch-input"
                                checked={reminder.is_enabled}
                                onChange={() => handleToggleReminder(reminder.id)}
                              />
                              <span className="toggle-switch-slider-bar"></span>
                            </label>
                          </div>
                        </div>

                        <div className="config-med-body">
                          <div className="config-body-item">
                            <Clock size={14} className="text-teal" />
                            <span>Times: {reminder.times.split(",").join(", ")}</span>
                          </div>
                          <div className="config-body-item">
                            <Activity size={14} className="text-teal" />
                            <span>Freq: {reminder.frequency.replace("_", " ")}</span>
                          </div>
                          <div className="config-body-item-full">
                            <CalendarIcon size={14} className="text-teal" />
                            <span>Duration: {reminder.start_date} to {reminder.end_date || "Continuous"}</span>
                          </div>
                          {reminder.instructions && (
                            <div className="config-body-item-full">
                              <Info size={14} className="text-teal" />
                              <span>Instructions: {reminder.instructions}</span>
                            </div>
                          )}
                        </div>

                        <div className="config-card-actions">
                          <button className="btn-icon-action" onClick={() => openEditDrawer(reminder)}>
                            <Edit size={12} /> Edit
                          </button>
                          <button className="btn-icon-action delete" onClick={() => handleDeleteReminder(reminder.id)}>
                            <Trash2 size={12} /> Delete
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            
            <button className="btn-floating-add" onClick={() => openAddDrawer()} aria-label="Add Reminder">
              <Plus size={24} />
            </button>
          </div>
        )}
      </main>

      {/* Scheduler Drawer Modal */}
      {showDrawer && (
        <div className="slide-drawer-overlay" onClick={() => setShowDrawer(false)}>
          <div className="slide-drawer" onClick={(e) => e.stopPropagation()}>
            <div className="drawer-header">
              <h3 className="drawer-title">{editingReminderId ? "Edit Medication Reminder" : "Add Medication Reminder"}</h3>
              <button className="btn-close-drawer" onClick={() => setShowDrawer(false)}>
                <X size={20} />
              </button>
            </div>

            <div className="drawer-body">
              <form onSubmit={handleReminderSubmit} className="drawer-form">
                <div className="form-row-2col">
                  <div className="form-group">
                    <label htmlFor="medname-input">Medication Name *</label>
                    <input
                      id="medname-input"
                      type="text"
                      className="auth-input"
                      placeholder="e.g. Metformin"
                      style={{ paddingLeft: "1rem" }}
                      value={reminderForm.medicine_name}
                      onChange={(e) => handleFormChange("medicine_name", e.target.value)}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="dosage-input">Dosage *</label>
                    <input
                      id="dosage-input"
                      type="text"
                      className="auth-input"
                      placeholder="e.g. 500 mg"
                      style={{ paddingLeft: "1rem" }}
                      value={reminderForm.dosage}
                      onChange={(e) => handleFormChange("dosage", e.target.value)}
                      required
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label htmlFor="freq-select">Frequency</label>
                  <select
                    id="freq-select"
                    className="form-select"
                    value={reminderForm.frequency}
                    onChange={(e) => handleFormChange("frequency", e.target.value)}
                  >
                    <option value="once_daily">Once daily</option>
                    <option value="twice_daily">Twice daily</option>
                    <option value="three_times_daily">Three times daily</option>
                    <option value="custom">Custom times</option>
                  </select>
                </div>

                <div className="form-group">
                  <label>Reminder Time(s)</label>
                  <div className="custom-times-list">
                    {reminderForm.times.map((time, idx) => (
                      <div key={idx} className="custom-time-input-row">
                        <input
                          type="time"
                          className="time-picker-input"
                          value={time}
                          onChange={(e) => handleTimeChange(idx, e.target.value)}
                          required
                        />
                        {reminderForm.frequency === "custom" && reminderForm.times.length > 1 && (
                          <button
                            type="button"
                            className="btn-remove-time-slot"
                            onClick={() => removeCustomTime(idx)}
                          >
                            <Trash2 size={16} />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>

                  {reminderForm.frequency === "custom" && (
                    <button
                      type="button"
                      className="btn-add-time-slot"
                      onClick={addCustomTime}
                    >
                      <Plus size={14} /> Add Reminder Time
                    </button>
                  )}
                </div>

                <div className="form-row-2col">
                  <div className="form-group">
                    <label htmlFor="start-date-input">Start Date *</label>
                    <input
                      id="start-date-input"
                      type="date"
                      className="auth-input"
                      style={{ paddingLeft: "1rem" }}
                      value={reminderForm.start_date}
                      onChange={(e) => handleFormChange("start_date", e.target.value)}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="end-date-input">End Date (Optional)</label>
                    <input
                      id="end-date-input"
                      type="date"
                      className="auth-input"
                      style={{ paddingLeft: "1rem" }}
                      value={reminderForm.end_date}
                      onChange={(e) => handleFormChange("end_date", e.target.value)}
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label htmlFor="instructions-input">Instructions (Optional)</label>
                  <input
                    id="instructions-input"
                    type="text"
                    className="auth-input"
                    placeholder="e.g. Take after meals"
                    style={{ paddingLeft: "1rem" }}
                    value={reminderForm.instructions}
                    onChange={(e) => handleFormChange("instructions", e.target.value)}
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="notes-input">Notes (Optional)</label>
                  <textarea
                    id="notes-input"
                    className="assistant-textarea"
                    rows={2}
                    placeholder="e.g. Prescribed by physician"
                    value={reminderForm.notes}
                    onChange={(e) => handleFormChange("notes", e.target.value)}
                  />
                </div>

                <div className="drawer-footer">
                  <button type="button" className="btn btn-secondary" onClick={() => setShowDrawer(false)}>
                    Cancel
                  </button>
                  <button type="submit" className="btn btn-primary">
                    {editingReminderId ? "Save Changes" : "Create Schedule"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Global Footer */}
      <footer className="footer">
        <div className="footer-content">
          <div className="footer-info">
            <div className="footer-logo">
              <MediRagLogo size={22} />
              <span>MediRAG</span>
            </div>
            <p className="footer-desc">
              Understand your medications using source-grounded FDA registries. Stay aligned, stay healthy.
            </p>
          </div>

          <div className="footer-links-group">
            <span className="footer-group-title">Platform</span>
            <a href="#about" className="footer-link" onClick={() => setActiveTab("home")}>About Us</a>
            <a href="#features" className="footer-link" onClick={() => setActiveTab("home")}>Features</a>
          </div>

          <div className="footer-links-group">
            <span className="footer-group-title">Legal & Resources</span>
            <a href="#privacy" className="footer-link" onClick={() => alert("MediRAG values your privacy. Your data remains stored locally in SQLite and is fully JWT encrypted.")}>Privacy Policy</a>
            <a href="#disclaimer" className="footer-link" onClick={() => alert("MediRAG is designed purely for information. It is not an alternative to licensed clinical care.")}>Medical Disclaimer</a>
          </div>
        </div>

        <div className="footer-bottom">
          <p>&copy; {new Date().getFullYear()} MediRAG – AI-Powered Medication Assistant.</p>
        </div>
      </footer>
    </div>
  );
}

export default App;

