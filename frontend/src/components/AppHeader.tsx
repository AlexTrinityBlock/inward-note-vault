import { Link, useNavigate, useParams } from "react-router-dom";

import { useAppShell } from "../hooks/useAppShell";
import { useEncryptedNotebook } from "../hooks/useEncryptedNotebook";
import { useTheme } from "../hooks/useTheme";
import { useI18n } from "../i18n";
import { Brand } from "./Brand";
import { Icon } from "./Icon";
import { LocaleSwitcher } from "./LocaleSwitcher";

/**
 * The application header: who you are, which notebook you are in, and the two
 * global switches (theme and language).
 *
 * The design shows this bar once per screen, so it is a component rather than
 * part of a route layout — the portal and the settings page render it too, and
 * each supplies its own leading control (a back link, or nothing).
 */
export function AppHeader({ leading }: { leading?: React.ReactNode }) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { notebook } = useParams<{ notebook?: string }>();
  const { username, signOut, signingOut } = useAppShell();
  const { isDark, toggle } = useTheme();
  const encryptedNotebook = useEncryptedNotebook();

  return (
    <header className="drive-top-header">
      <div className="drive-header-left">
        {leading}

        <Link to="/" className="drive-brand" title={t("portal.title")}>
          <Brand size={20} />
          <span className="drive-brand-text">{t("app.name")}</span>
        </Link>

        {notebook ? (
          <div
            className={`current-vault-indicator${notebook === "encrypted" ? " encrypted" : ""}`}
          >
            <span className="vault-mini-badge">
              <Icon name={notebook === "encrypted" ? "lock" : "file"} size={11} />
            </span>
            <span>
              {notebook === "encrypted" ? t("notes.encryptedNotebook") : t("notes.plainNotebook")}
            </span>
          </div>
        ) : null}
      </div>

      <div className="drive-header-right">
        {notebook === "encrypted" && encryptedNotebook.unlocked ? (
          <button
            type="button"
            className="ghost header-lock-btn"
            title={t("crypto.lock")}
            onClick={() => {
              encryptedNotebook.lock();
              navigate(`/n/${notebook}`, { replace: true });
            }}
          >
            <Icon name="lock" size={14} />
            <span>{t("crypto.lock")}</span>
          </button>
        ) : null}

        <button
          type="button"
          className="drive-icon-btn ghost"
          title={t("theme.toggle")}
          aria-label={t("theme.toggle")}
          onClick={toggle}
        >
          <Icon name={isDark ? "sun" : "moon"} size={16} />
        </button>

        <LocaleSwitcher />

        <Link to="/settings" className="user-badge" title={t("common.settings")}>
          <Icon name="user" size={13} />
          <span className="user-badge-name">{username}</span>
        </Link>

        <button type="button" className="ghost" onClick={() => void signOut()} disabled={signingOut}>
          {t("common.signOut")}
        </button>
      </div>
    </header>
  );
}
