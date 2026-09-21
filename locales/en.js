// English. Keys mirror locales/ka.js — anything missing here falls back to
// Georgian at runtime, and scripts/i18n-check.js reports the gap.

export default {
  common: {
    error: "Error",
    attention: "Attention",
    cancel: "Cancel",
    continue: "Continue",
    email: "Email",
    password: "Password",
    login: "Sign in",
    register: "Sign up",
    phoneRequiredTitle: "Enter your number",
    phoneRequiredBody: "A phone number is required.",
  },

  language: {
    title: "Choose your language",
    subtitle: "You can change it later in your profile.",
  },

  splash: {
    title: "Your Rhythm",
    subtitle: "Discover the harmony of your body",
  },

  auth: {
    login: {
      title: "Sign in",
      subtitle: "Enter your email and password to access your account.",
      fillFields: "Please enter your email and password",
      systemError: "Something went wrong while signing in",
      biometricNeedsPassword: "To enable biometric sign-in, sign in with your password once first.",
      faceIdPrompt: "Sign in with Face ID",
      faceIdFallback: "Use passcode",
      authFailed: "Sign-in failed.",
      noAccount: "Don't have an account? ",
      quickLogin: "or sign in quickly",
    },
    register: {
      title: "The end and the beginning",
      subtitle: "Create an account so your data is always safe and saved.",
      fillFields: "Please enter your email and password",
      cycleInsertNotice:
        "Your account was created, but the first cycle entry could not be fully saved. The app will still work using your profile data.",
      completedTitle: "Registration complete",
      failedTitle: "Registration failed",
      button: "Finish registration 🚀",
      haveAccount: "Already have an account? ",
    },
  },

  onboarding: {
    nextStep: "Next step ✨",
    name: {
      title: "What's your name?",
      subtitle: "Tell us your name and phone number so we can set up your profile properly.",
      namePlaceholder: "Enter your name...",
      phonePlaceholder: "Phone number",
      haveAccount: "Already have an account? ",
    },
    birth: {
      title: "When were you born?",
      subtitle: "This helps us make your cycle predictions even more accurate and personal.",
      dateLabel: "Date of birth",
      confirm: "Confirm",
    },
    protection: {
      title: "What protection do you use?",
      subtitle: "This helps us calculate ovulation and fertile days more accurately.",
      options: {
        condom: "Condom",
        hormonal: "Hormonal pills",
        iud: "IUD",
        virgin: "Not sexually active",
        none: "None / natural",
      },
    },
    health: {
      title: "Your health",
      subtitle: "Any health concerns? This helps us analyse your cycle better.",
      options: {
        none: "No, I'm perfectly healthy",
        hormonal: "Hormonal issue",
        infection: "Infection",
        unsure: "I don't know / not sure",
      },
    },
    cycleLength: {
      title: "Your cycle",
      subtitle: "Pick your average lengths so we can make accurate predictions.",
      cycleSection: "Cycle length (days)",
      periodSection: "Period length (days)",
      dayLabel: "days",
    },
    lastPeriod: {
      title: "First day of your last period",
      subtitle: "Choose the date your last period started. If today is day three, pick the date two days ago.",
      month: "Month",
      day: "Day",
    },
    notifications: {
      title: "Want reminders?",
      subtitle: "Turn on notifications and the app will remind you about your upcoming period, fertile days and gentle check-ins.",
      cardTitle: "What you'll get",
      item1: "• A reminder before your period",
      item2: "• Ovulation and fertile-day alerts",
      item3: "• An occasional check-in: how are you feeling today?",
      alreadyEnabled: "Notification access is already on.",
      enableButton: "Turn on reminders",
      skipButton: "Not now",
      disabledTitle: "Notifications are off",
      disabledBody: "You can turn them on later from your profile whenever you like.",
      enableFailed: "Couldn't turn on notifications. You can enable them later from your profile.",
    },
  },
};
