import React from 'react';
import { Role } from '../types';

interface RoleGuardProps {
  allowedRole: Role;
  userRole?: Role;
  children: React.ReactNode;
}

export const RoleGuard: React.FC<RoleGuardProps> = ({ allowedRole, userRole, children }) => {
  if (userRole !== allowedRole) {
    return null;
  }
  return <>{children}</>;
};
