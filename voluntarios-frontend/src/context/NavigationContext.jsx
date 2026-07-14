/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useContext } from 'react';

const NavigationContext = createContext(null);

export function NavigationProvider({ value, children }) {
  return <NavigationContext.Provider value={value}>{children}</NavigationContext.Provider>;
}

export function useNavigation() {
  const context = useContext(NavigationContext);

  if (!context) {
    throw new Error('useNavigation deve ser usado dentro de NavigationProvider.');
  }

  return context;
}
