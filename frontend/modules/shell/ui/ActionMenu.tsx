'use client';

import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import React, { ReactNode } from 'react';

interface ActionMenuProps {
  trigger: ReactNode;
  children: ReactNode;
  align?: 'start' | 'center' | 'end';
}

export function ActionMenu({ trigger, children, align = 'end' }: ActionMenuProps) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        {trigger}
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          className="action-menu-content animate-fade-in"
          align={align}
          sideOffset={8}
        >
          {children}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

interface ActionMenuItemProps {
  children: ReactNode;
  onClick?: (event: Event) => void;
  destructive?: boolean;
  disabled?: boolean;
}

export function ActionMenuItem({ children, onClick, destructive, disabled }: ActionMenuItemProps) {
  return (
    <DropdownMenu.Item
      className={`action-menu-item ${destructive ? 'item-danger' : ''}`}
      onSelect={onClick}
      disabled={disabled}
    >
      {children}
    </DropdownMenu.Item>
  );
}

export function ActionMenuLabel({ children }: { children: ReactNode }) {
  return <DropdownMenu.Label className="action-menu-label">{children}</DropdownMenu.Label>;
}

export function ActionMenuSeparator() {
  return <DropdownMenu.Separator className="action-menu-separator" />;
}
