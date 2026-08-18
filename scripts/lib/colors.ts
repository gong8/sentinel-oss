/**
 * Cross-platform console colors and styling utilities
 */

// ANSI color codes
export const colors = {
  red: '\x1b[0;31m',
  green: '\x1b[0;32m',
  yellow: '\x1b[1;33m',
  blue: '\x1b[0;34m',
  cyan: '\x1b[0;36m',
  bold: '\x1b[1m',
  reset: '\x1b[0m',
} as const;

// Color helper functions
export const red = (text: string) => `${colors.red}${text}${colors.reset}`;
export const green = (text: string) => `${colors.green}${text}${colors.reset}`;
export const yellow = (text: string) => `${colors.yellow}${text}${colors.reset}`;
export const blue = (text: string) => `${colors.blue}${text}${colors.reset}`;
export const cyan = (text: string) => `${colors.cyan}${text}${colors.reset}`;
export const bold = (text: string) => `${colors.bold}${text}${colors.reset}`;

// Combined styles
export const boldBlue = (text: string) => `${colors.bold}${colors.blue}${text}${colors.reset}`;
export const boldGreen = (text: string) => `${colors.bold}${colors.green}${text}${colors.reset}`;
export const boldRed = (text: string) => `${colors.bold}${colors.red}${text}${colors.reset}`;
export const boldYellow = (text: string) => `${colors.bold}${colors.yellow}${text}${colors.reset}`;
