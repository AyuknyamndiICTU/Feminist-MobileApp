/** Process-wide connectivity flag, read by the API client at call time and updated by AppProvider. */
export const connectivity = { online: true };

export const isOnline = (): boolean => connectivity.online;
