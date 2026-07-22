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

function App() {
  // Navigation & Theme
  const [activeTab, setActiveTab] = useState("home"); // home (landing), dashboard, assistant, reminders, profile
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
      text: "Hello! I am your AI Medication Assistant. Ask me any questions about your medications (dosage, warnings, side effects, interactions) and I will retrieve official, source-grounded FDA drug label information to answer them.",
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
  const [toast, setToast] = useState(null); // { message, type }

  // Ref to chat auto-scroll
  const chatEndRef = useRef(null);

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
    }, 30000); // Update every 30 seconds
    return () => clearInterval(timer);
  }, [dateSchedule]);

  // Browser Notification permissions state
  const [notificationPermission, setNotificationPermission] = useState(
    typeof window !== "undefined" ? Notification.permission : "default"
  );

  // Toast Notification helper
  const showToast = (message, type = "success") => {
    setToast({ message, type });
    setTimeout(() => {
      setToast(null);
    }, 4000);
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

  // Get weekday dates dynamically for current week
  const getWeekDates = () => {
    const current = new Date();
    const week = [];
    const currentDay = current.getDay(); // 0 is Sun, 1 is Mon
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

  // Fetch log records & occurrences
  const fetchDateSchedule = async (dateStr) => {
    if (!token) return;
    try {
      const todayStr = getTodayDateString();
      let queryTime = getCurrentTimeString();
      
      // If selected date is in the past, everything not logged is missed
      if (dateStr < todayStr) {
        queryTime = "23:59";
      } 
      // If selected date is in the future, everything not logged is upcoming
      else if (dateStr > todayStr) {
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
      console.error("Failed to fetch reminders templates:", err);
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

  // Auth actions
  const handleAuthSubmit = async (e) => {
    e.preventDefault();
    setAuthError("");
    setAuthLoading(true);

    if (authMode === "signup") {
      // Validate signup
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
      // Login
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

  // Profile configuration updates
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

  // Password validation criteria
  const isPasswordValid = (pwd) => {
    return pwd.length >= 8 && /[A-Z]/.test(pwd) && /[a-z]/.test(pwd) && /[0-9]/.test(pwd);
  };

  // Toggle Reminder is_enabled status
  const handleToggleReminder = async (id) => {
    try {
      await axios.put(`${API_BASE}/api/reminders/${id}/toggle`);
      fetchReminders();
      fetchDateSchedule(selectedDate);
      showToast("Medication status toggled.");
    } catch (err) {
      console.error("Failed to toggle reminder templates:", err);
      showToast("Error updating reminder status.", "error");
    }
  };

  // Log medication occurrence (Taken / Skipped)
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

  // Delete configuration template
  const handleDeleteReminder = async (id) => {
    if (!window.confirm("Are you sure you want to delete this medication reminder? This will clear all schedules.")) return;
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

  // Drawer slider actions
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
        // Edit reminder
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
        // Create reminder
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

  // Calculate adherence progress metrics
  const activeTodaySchedule = dateSchedule.filter(t => t.status !== "disabled");
  const totalToday = activeTodaySchedule.length;
  const takenToday = activeTodaySchedule.filter(t => t.status === "taken").length;
  const skippedToday = activeTodaySchedule.filter(t => t.status === "skipped").length;
  const missedToday = activeTodaySchedule.filter(t => t.status === "missed").length;
  const upcomingToday = activeTodaySchedule.filter(t => t.status === "upcoming").length;
  const completionPercent = totalToday > 0 ? Math.round((takenToday / totalToday) * 100) : 0;

  // Calculate countdown to next upcoming reminder
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

    // Find the one closest to now
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
      // Format diff into text
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

  // Greeting based on time of day
  const getGreeting = () => {
    const hrs = new Date().getHours();
    if (hrs < 12) return "Good morning";
    if (hrs < 18) return "Good afternoon";
    return "Good evening";
  };

  // Search input change and autocomplete recommendations
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

  // RAG Consultation Actions
  const handleSendMessage = async (e, customDrug = null, customQuestion = null) => {
    if (e) e.preventDefault();

    const activeDrug = customDrug !== null ? customDrug : drugName;
    const activeQuestion = customQuestion !== null ? customQuestion : question;

    if (!activeQuestion.trim()) return;

    // Build the user message bubble content
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

  // Direct redirection from Quick Ask AI inside Dashboard
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

  // Get user avatar initials
  const getUserInitials = () => {
    if (!user || !user.full_name) return "U";
    return user.full_name
      .split(" ")
      .map(part => part.charAt(0))
      .slice(0, 2)
      .join("")
      .toUpperCase();
  };

  // Trigger Notifications Permission setup
  const requestNotificationPermission = () => {
    if (!("Notification" in window)) {
      alert("This browser does not support desktop notifications.");
      return;
    }
    Notification.requestPermission().then((permission) => {
      setNotificationPermission(permission);
    });
  };

  // Active Dropdown state
  const [dropdownOpen, setDropdownOpen] = useState(false);

  return (
    <div className="app-container">
      {/* Decorative Orbs */}
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
          <Activity size={28} className="brand-icon" />
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

        {/* Action button rows */}
        <div className="nav-actions">
          {/* Light/Dark Toggle */}
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

          {/* Hamburger Menu on Mobile */}
          <button className="mobile-menu-btn" onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>
            {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>

        {/* Mobile menu panel */}
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

      {/* Main Container Viewport */}
      <main className="main-content">
        
        {/* ============================================================== */}
        {/* LANDING PAGE (UNAUTHENTICATED)                                 */}
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
                  Understand your medications with AI-powered, FDA-grounded information and stay on track with personalized medication reminders.
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

              {/* Animated Custom Right Hero Art */}
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
                      <Activity size={12} /> Assistant
                    </span>
                    <span className="mock-title">How does this interact with coffee?</span>
                    <span className="mock-text">Retrieving safety section logs...</span>
                  </div>
                </div>
              </div>
            </section>

            {/* How MediRAG Helps Section */}
            <section className="features-section">
              <div className="section-header">
                <h2 className="section-title">How MediRAG Helps You</h2>
                <p className="section-desc">We leverage direct, persistent vector indexing of official drug label registries to give you total safety control.</p>
              </div>

              <div className="features-grid">
                <div className="feature-card">
                  <div className="feature-icon-wrapper">
                    <MessageSquare size={24} />
                  </div>
                  <h3>Ask About Medicines</h3>
                  <p>Get easy-to-understand medication information grounded in official FDA drug-label data.</p>
                </div>

                <div className="feature-card">
                  <div className="feature-icon-wrapper">
                    <Bookmark size={24} />
                  </div>
                  <h3>Get Reliable Sources</h3>
                  <p>View the FDA label sections used by the AI to generate each response. Total traceability.</p>
                </div>

                <div className="feature-card">
                  <div className="feature-icon-wrapper">
                    <Bell size={24} />
                  </div>
                  <h3>Never Miss a Reminder</h3>
                  <p>Create personalized medication schedules and track whether medications were taken or skipped.</p>
                </div>
              </div>
            </section>

            {/* How It Works visual flows */}
            <section className="flows-container">
              <div className="workflow-wrapper">
                <h3 className="workflow-title">AI RAG Pipeline Workflow</h3>
                <div className="flow-steps">
                  <div className="flow-step">
                    <span className="flow-step-num">1</span>
                    <span className="flow-step-text">Ask a Question</span>
                  </div>
                  <ChevronDown className="flow-arrow" style={{ transform: "rotate(-90deg)" }} size={16} />
                  <div className="flow-step">
                    <span className="flow-step-num">2</span>
                    <span className="flow-step-text">AI Searches FDA Database</span>
                  </div>
                  <ChevronDown className="flow-arrow" style={{ transform: "rotate(-90deg)" }} size={16} />
                  <div className="flow-step">
                    <span className="flow-step-num">3</span>
                    <span className="flow-step-text">Relevant Sections Retrieved</span>
                  </div>
                  <ChevronDown className="flow-arrow" style={{ transform: "rotate(-90deg)" }} size={16} />
                  <div className="flow-step">
                    <span className="flow-step-num">4</span>
                    <span className="flow-step-text">AI Generates Grounded Answer</span>
                  </div>
                </div>
              </div>

              <div className="workflow-wrapper">
                <h3 className="workflow-title">Reminder Logging System</h3>
                <div className="flow-steps">
                  <div className="flow-step">
                    <span className="flow-step-num">1</span>
                    <span className="flow-step-text">Add Medication</span>
                  </div>
                  <ChevronDown className="flow-arrow" style={{ transform: "rotate(-90deg)" }} size={16} />
                  <div className="flow-step">
                    <span className="flow-step-num">2</span>
                    <span className="flow-step-text">Choose Schedule</span>
                  </div>
                  <ChevronDown className="flow-arrow" style={{ transform: "rotate(-90deg)" }} size={16} />
                  <div className="flow-step">
                    <span className="flow-step-num">3</span>
                    <span className="flow-step-text">Receive Reminder</span>
                  </div>
                  <ChevronDown className="flow-arrow" style={{ transform: "rotate(-90deg)" }} size={16} />
                  <div className="flow-step">
                    <span className="flow-step-num">4</span>
                    <span className="flow-step-text">Mark Taken or Skipped</span>
                  </div>
                </div>
              </div>
            </section>
          </div>
        )}

        {/* ============================================================== */}
        {/* SPLIT-SCREEN AUTHENTICATION PAGE                               */}
        {/* ============================================================== */}
        {activeTab === "auth" && (
          <div className="auth-container fade-in-up">
            {/* Left Column Benefit Highlights */}
            <div className="auth-left-pane">
              <div className="auth-benefits-block">
                <div className="auth-hero-branding">
                  <Activity className="auth-logo-icon" size={32} />
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
                      <p className="benefit-desc">Answers are extracted strictly from official databases without hallucinations.</p>
                    </div>
                  </div>

                  <div className="auth-benefit-item">
                    <div className="benefit-icon-box">
                      <Clock size={18} />
                    </div>
                    <div>
                      <h4 className="benefit-title">Smart reminder scheduler</h4>
                      <p className="benefit-desc">Easily log adherence rates for any custom prescription timetables.</p>
                    </div>
                  </div>

                  <div className="auth-benefit-item">
                    <div className="benefit-icon-box">
                      <UserCheck size={18} />
                    </div>
                    <div>
                      <h4 className="benefit-title">Individual secure accounts</h4>
                      <p className="benefit-desc">All RAG chat logs and scheduled reminders are password hashed and JWT protected.</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Right Column Login/Signup Card Form */}
            <div className="auth-right-pane">
              <div className="auth-form-card">
                <div className="auth-card-header">
                  <h3 className="auth-card-title">{authMode === "login" ? "Welcome Back" : "Create Account"}</h3>
                  <p className="auth-card-desc">
                    {authMode === "login" ? "Access your personal medication assistant" : "Register your email to configure customized alerts"}
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
                      {/* Live criteria validation checklist */}
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
        {/* USER PROFILE WORKSPACE PAGE                                    */}
        {/* ============================================================== */}
        {activeTab === "profile" && token && (
          <div className="profile-container fade-in-up">
            <div className="profile-card">
              <div className="profile-avatar-large-container">
                <div className="profile-avatar-large">{getUserInitials()}</div>
                <h3>{user?.full_name}</h3>
                <span className="profile-email-label">{user?.email}</span>
              </div>

              {profileError && (
                <div className="alert-error">
                  <AlertTriangle size={16} />
                  <span>{profileError}</span>
                </div>
              )}
              {profileSuccess && (
                <div className="toast-notification success" style={{ position: "relative", bottom: 0, left: 0, width: "100%" }}>
                  <CheckCircle2 size={16} className="text-mint" />
                  <span>{profileSuccess}</span>
                </div>
              )}

              <form onSubmit={handleProfileSubmit} className="profile-form-section">
                <h4 className="profile-section-title">Edit Details</h4>
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

                <h4 className="profile-section-title">Change Password</h4>
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
                      placeholder="Confirm your password"
                      value={profileForm.confirm_new_password}
                      onChange={(e) => setProfileForm({ ...profileForm, confirm_new_password: e.target.value })}
                    />
                  </div>
                </div>

                <button type="submit" className="btn btn-primary" style={{ marginTop: "1rem" }}>
                  Save Changes
                </button>
              </form>
            </div>
          </div>
        )}

        {/* ============================================================== */}
        {/* PERSONALIZED USER DASHBOARD                                    */}
        {/* ============================================================== */}
        {activeTab === "dashboard" && token && (
          <div className="fade-in-up">
            {/* Header Greeting Bar */}
            <div className="dashboard-header-bar">
              <h2 className="dashboard-title">{getGreeting()}, {user?.full_name?.split(" ")[0]}</h2>
              <p className="dashboard-subtitle">Here's your medication overview for today.</p>
            </div>

            <div className="dashboard-grid">
              {/* Left Column widgets: timeline and search */}
              <div className="dashboard-left">
                {/* Timeline Card */}
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

                {/* Ask AI quick input card */}
                <div className="quick-ai-card">
                  <h3 className="card-heading" style={{ fontSize: "1.15rem" }}>
                    <Activity size={18} className="text-teal" /> Have a question about your medication?
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

              {/* Right Column widgets: circular progress and countdown */}
              <div className="dashboard-right">
                {/* Circular progress card */}
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

                {/* Highlight upcoming countdown */}
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
        {/* AI MEDICATION ASSISTANT PANEL                                  */}
        {/* ============================================================== */}
        {activeTab === "assistant" && token && (
          <div className="assistant-layout-container fade-in-up">
            {/* Sidebar consultation query forms */}
            <div className="assistant-search-sidebar">
              <h3 className="card-heading">
                <Activity size={18} className="text-teal" /> Consult Drug Label RAG
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
                    placeholder="e.g. What are the warnings or side effects? How should I store it?"
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

              {/* Sidebar suggested list */}
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

            {/* Right Chat feed panel */}
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
                        <User size={12} />
                        <span>{msg.sender === "ai" ? "MediRAG Assistant" : "You"}</span>
                      </div>
                      <div>{msg.text}</div>

                      {/* Prefill reminder addition btn */}
                      {msg.sender === "ai" && msg.drug && (
                        <div className="ai-actions-row">
                          <span className="ai-action-tag">
                            <ShieldAlert size={12} className="text-amber" /> Reminders must be manually entered or confirmed.
                          </span>
                          <button
                            className="btn btn-secondary btn-sm"
                            style={{ width: "fit-content", padding: "0.4rem 0.8rem", fontSize: "0.85rem" }}
                            onClick={() => openAddDrawer({ medicine_name: msg.drug })}
                          >
                            <Plus size={14} /> Prefill Reminder for {msg.drug}
                          </button>
                        </div>
                      )}

                      {/* Expandable collapsible source sections */}
                      {msg.sender === "ai" && msg.sources && msg.sources.length > 0 && (
                        <div className="fda-sources-accordion">
                          <details>
                            <summary className="sources-toggle-summary">
                              <Info size={14} /> View Grounded Sources ({msg.sources.length})
                            </summary>
                            <div className="sources-accordion-content">
                              {msg.sources.map((src, sIdx) => {
                                const isOfficial = src.source_type === "official_fda" || 
                                  (!src.source_type && (src.source || "").toLowerCase().includes("fda"));
                                return (
                                  <div key={sIdx} className="source-card-box">
                                    <div className="source-card-badges">
                                      <span className="source-badge drug">{src.drug_name}</span>
                                      <span className="source-badge section">{src.section_name}</span>
                                      {isOfficial ? (
                                        <span className="source-badge source-type-official">FDA Official</span>
                                      ) : (
                                        <span className="source-badge source-type-manual">Local Document</span>
                                      )}
                                    </div>
                                    <p className="source-card-excerpt">"{src.source_text}"</p>
                                    <div className="source-card-footer">
                                      <span>Source: {src.source}</span>
                                      {src.original_filename && <span>File: {src.original_filename}</span>}
                                      {src.doc_id && <span>DocID: {src.doc_id}</span>}
                                      {src.source_url && (
                                        <span>
                                          URL: <a href={src.source_url} target="_blank" rel="noopener noreferrer" className="source-link-url" style={{ textDecoration: "underline", color: "var(--brand-teal)" }}>{src.source_url}</a>
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </details>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                {loadingChat && (
                  <div className="chat-msg-row ai">
                    <div className="msg-bubble">
                      <div className="msg-meta-header">
                        <User size={12} />
                        <span>MediRAG Assistant</span>
                      </div>
                      <div className="typing-dot-loader">
                        <div className="typing-dot"></div>
                        <div className="typing-dot"></div>
                        <div className="typing-dot"></div>
                      </div>
                      <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginTop: "0.2rem" }}>
                        Retrieving relevant chunks from vector database and generating grounded answer...
                      </p>
                    </div>
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>

              {/* Safety notice disclaimer footer inside panel */}
              <div style={{ background: "var(--bg-secondary)", padding: "0.75rem 1.5rem", borderTop: "1px solid var(--border-color)", fontSize: "0.8rem", color: "var(--text-secondary)" }}>
                <strong>Safety Disclaimer:</strong> MediRAG provides medication information based on available FDA drug-label data for informational purposes only. It does not provide medical diagnosis or personalized treatment advice.
              </div>
            </div>
          </div>
        )}

        {/* ============================================================== */}
        {/* CALENDAR REMINDERS PAGE                                        */}
        {/* ============================================================== */}
        {activeTab === "reminders" && token && (
          <div className="fade-in-up">
            <div className="reminders-page-header">
              <h2>Medication Timetable Scheduler</h2>
              <button className="btn btn-primary" onClick={() => openAddDrawer()}>
                <Plus size={18} /> Add Reminder
              </button>
            </div>

            {/* Weekly Selector Card */}
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

            {/* Split layout: Today occurrence logs, Configured templates list */}
            <div className="reminders-split-layout">
              {/* Left Column occurrences schedule list */}
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

              {/* Right Column configuration list */}
              <div className="reminders-list-column">
                <div className="column-header-box">
                  <h3 className="column-title">Reminder Profiles</h3>
                  <span className="column-count-badge">{reminders.length} total</span>
                </div>

                {reminders.length === 0 ? (
                  <div className="empty-state-card">
                    <Activity className="empty-state-icon" />
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
                          {reminder.notes && (
                            <div className="config-body-item-full" style={{ fontStyle: "italic", fontSize: "0.8rem", color: "var(--text-muted)" }}>
                              <span>Note: {reminder.notes}</span>
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
            
            {/* Floating add button */}
            <button className="btn-floating-add" onClick={() => openAddDrawer()} aria-label="Add Reminder">
              <Plus size={24} />
            </button>
          </div>
        )}
      </main>

      {/* ============================================================== */}
      {/* SLIDE-OUT SCHEDULER DRAWER MODAL                               */}
      {/* ============================================================== */}
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

                {/* Times scheduler checklist list */}
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
                    placeholder="e.g. Prescribed by cardiologist"
                    value={reminderForm.notes}
                    onChange={(e) => handleFormChange("notes", e.target.value)}
                  />
                </div>

                <div style={{ display: "flex", gap: "0.5rem", background: "var(--brand-teal-light)", padding: "0.75rem", borderRadius: "0.6rem", fontSize: "0.8rem", color: "var(--text-primary)" }}>
                  <ShieldCheck size={16} className="text-teal" style={{ flexShrink: 0 }} />
                  <span>Schedules should correspond exactly to instructions provided by your doctor or pharmacist.</span>
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

      {/* Global professional Footer */}
      <footer className="footer">
        <div className="footer-content">
          <div className="footer-info">
            <div className="footer-logo">
              <Activity className="footer-logo-icon" size={20} />
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
            <a href="#workflow" className="footer-link" onClick={() => setActiveTab("home")}>How it Works</a>
          </div>

          <div className="footer-links-group">
            <span className="footer-group-title">Legal & Resources</span>
            <a href="#privacy" className="footer-link" onClick={() => alert("MediRAG values your privacy. Your data remains stored locally in SQLite and is fully JWT encrypted.")}>Privacy Policy</a>
            <a href="#disclaimer" className="footer-link" onClick={() => alert("MediRAG is designed purely for information. It is not an alternative to licensed clinical care.")}>Medical Disclaimer</a>
            <a href="#github" className="footer-link" onClick={() => window.open("https://github.com", "_blank")}>GitHub Repository</a>
          </div>
        </div>

        <div className="footer-bottom">
          <p>&copy; {new Date().getFullYear()} MediRAG – AI-Powered Medication Assistant. Built under strict grounding guardrails.</p>
        </div>
      </footer>
    </div>
  );
}

export default App;
