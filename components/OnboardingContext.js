import { createContext, useState } from "react";

export const OnboardingContext = createContext();

const initialState = {
  name: "",
  birth_date: null,
  protection: "",
  health: "",
  cycle_length: null,
  last_period: null
};

export const OnboardingProvider = ({ children }) => {

  const [data, setData] = useState(initialState);

  const resetOnboarding = () => {
    setData(initialState);
  };

  return (
    <OnboardingContext.Provider
      value={{
        data,
        setData,
        resetOnboarding
      }}
    >
      {children}
    </OnboardingContext.Provider>
  );
};