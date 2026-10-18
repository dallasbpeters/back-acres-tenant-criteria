"use client";
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  Button,
  Menu,
  MenuItem,
  MenuTrigger,
  Popover,
} from "react-aria-components";
type Theme = "system" | "light" | "dark";
const key = "back-acres-theme";
const modes: Theme[] = ["system", "light", "dark"];

const ThemeContext = createContext<{
  preference: Theme;
  setPreference: (theme: Theme) => void;
}>({ preference: "system", setPreference: () => {} });
function readPreference(): Theme {
  try {
    const saved = localStorage.getItem(key);
    if (modes.includes(saved as Theme)) return saved as Theme;
  } catch {}
  return "system";
}
function apply(preference: Theme) {
  document.documentElement.dataset.themePreference = preference;
  document.documentElement.dataset.theme =
    preference === "system"
      ? matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light"
      : preference;
}
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setState] = useState<Theme>("system"),
    current = useRef<Theme>("system");
  useEffect(() => {
    const query = matchMedia("(prefers-color-scheme: dark)");
    const sync = () => {
      const value = readPreference();
      current.current = value;
      setState(value);
      apply(value);
    };
    const device = () => apply(current.current);
    const storage = (event: StorageEvent) => {
      if (event.key === key || event.key === null) sync();
    };
    sync();
    query.addEventListener("change", device);
    window.addEventListener("storage", storage);
    return () => {
      query.removeEventListener("change", device);
      window.removeEventListener("storage", storage);
    };
  }, []);
  function setPreference(value: Theme) {
    try {
      localStorage.setItem(key, value);
    } catch {}
    current.current = value;
    setState(value);
    apply(value);
  }
  return (
    <ThemeContext.Provider value={{ preference, setPreference }}>
      {children}
    </ThemeContext.Provider>
  );
}
export function ThemeControl() {
  const { preference, setPreference } = useContext(ThemeContext),
    label = preference[0].toUpperCase() + preference.slice(1);
  return (
    <MenuTrigger>
      <Button className="theme-control" aria-label={`Color theme: ${label}`}>
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="8" />
          <path d="M12 4v16M12 4a8 8 0 0 1 0 16" fill="currentColor" />
        </svg>
        <span>Theme</span>
      </Button>
      <Popover className="theme-popover" placement="bottom end">
        <Menu
          aria-label="Color theme"
          selectionMode="single"
          disallowEmptySelection
          selectedKeys={[preference]}
          onAction={(id) => {
            if (modes.includes(id as Theme)) setPreference(id as Theme);
          }}
        >
          {modes.map((mode) => (
            <MenuItem
              key={mode}
              id={mode}
              textValue={mode}
              className="theme-option"
            >
              <span>
                {mode === "system"
                  ? "Use device setting"
                  : mode === "light"
                    ? "Light"
                    : "Dark"}
              </span>
              <span className="theme-check" aria-hidden="true">
                {preference === mode ? "✓" : ""}
              </span>
            </MenuItem>
          ))}
        </Menu>
      </Popover>
    </MenuTrigger>
  );
}
