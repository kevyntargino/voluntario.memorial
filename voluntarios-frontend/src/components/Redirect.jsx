import React, { useEffect } from 'react';
import { useNavigation } from '../context/NavigationContext';

export function Redirect({ to, replace = true }) {
  const { navigate } = useNavigation();

  useEffect(() => {
    navigate(to, { replace });
  }, [navigate, replace, to]);

  return null;
}
