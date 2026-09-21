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
    name: {
      title: "What's your name?",
      subtitle: "Tell us your name and phone number so we can set up your profile properly.",
      namePlaceholder: "Enter your name...",
      phonePlaceholder: "Phone number",
      nextButton: "Next step ✨",
      haveAccount: "Already have an account? ",
    },
  },
};
