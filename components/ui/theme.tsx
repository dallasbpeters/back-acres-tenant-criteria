// biome-ignore-all lint/performance/noJsxPropsBind: Native and React Aria controls are not memoized app children; local event/render callbacks intentionally capture the current form or row values.
"use client";
import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  Button,
  Menu,
  MenuItem,
  MenuTrigger,
  Popover,
} from "react-aria-components";
import { Icon } from "./icon";

type Theme = "system" | "light" | "dark";
const key = "back-acres-theme";
const modes: Theme[] = ["system", "light", "dark"];
const ThemeContext = createContext<{
  preference: Theme;
  setPreference: (theme: Theme) => void;
}>({
  preference: "system",
  setPreference: () => {
    /* Best-effort fallback: retain the original result when this optional operation fails. */
  },
});
function readPreference(): Theme {
  try {
    const saved = localStorage.getItem(key);
    if (modes.includes(saved as Theme)) {
      return saved as Theme;
    }
  } catch {
    /* Best-effort fallback: retain the original result when this optional operation fails. */
  }
  return "system";
}
function apply(preference: Theme) {
  document.documentElement.dataset.themePreference = preference;
  const resolveResult1 = () => {
    if (preference === "system") {
      if (matchMedia("(prefers-color-scheme: dark)").matches) {
        return "dark";
      }
      return "light";
    }
    return preference;
  };
  document.documentElement.dataset.theme = resolveResult1();
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
      if (event.key === key || event.key === null) {
        sync();
      }
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
    } catch {
      /* Best-effort fallback: retain the original result when this optional operation fails. */
    }
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
      <Button aria-label={`Color theme: ${label}`} className="theme-control">
        <Icon name="theme" size={18} />
        <span>Theme</span>
      </Button>
      <Popover className="theme-popover" placement="bottom end">
        <Menu
          aria-label="Color theme"
          disallowEmptySelection
          onAction={(id) => {
            if (modes.includes(id as Theme)) {
              setPreference(id as Theme);
            }
          }}
          selectedKeys={[preference]}
          selectionMode="single"
        >
          {modes.map((mode) => {
            const resolveResult2 = () => {
              if (mode === "system") {
                return "Use device setting";
              }
              if (mode === "light") {
                return "Light";
              }
              return "Dark";
            };
            return (
              <MenuItem
                className="theme-option"
                id={mode}
                key={mode}
                textValue={mode}
              >
                <span>{resolveResult2()}</span>
                <span aria-hidden="true" className="theme-check">
                  {preference === mode ? <Icon name="check" size={16} /> : null}
                </span>
              </MenuItem>
            );
          })}
        </Menu>
      </Popover>
    </MenuTrigger>
  );
}
