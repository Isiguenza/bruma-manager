import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function getApiUrl(): string {
  return process.env.NEXT_PUBLIC_API_SERVER_URL || "https://api.cocinabruma.com.mx";
}
