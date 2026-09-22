import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { Brand } from "../components/Brand";
import { Icon } from "../components/Icon";
import { UnlockDialog } from "../components/UnlockDialog";
import { useEncryptedNotebook } from "../hooks/useEncryptedNotebook";
import { useTheme } from "../hooks/useTheme";
import { useI18n } from "../i18n";

/**
 * Tier one: choosing a notebook.
 *
 * In the previous design the two notebooks were tabs above the workspace, which
 * meant the choice was buried inside the thing it chose between. Here it is a
 * page of its own, so "which notebook" is answered before anything loads — and
 * the encrypted notebook is locked before the app has read a single note.
 */
export function PortalRoute() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const notebook = useEncryptedNotebook();
  const { isDark, toggle } = useTheme();
  const [showUnlock, setShowUnlock] = useState(false);

  /** An existing notebook asks for its password; a new one sets it. */
  const hasProfile = Boolean(notebook.profile);

  function openEncrypted() {
    if (notebook.unlocked) {
      navigate("/n/encrypted");
      return;
    }
    setShowUnlock(true);
  }

  return (
    <div className="portal-container">
      <header className="portal-header">
        <div className="portal-brand">
          <Brand size={20} />
          <span>{t("app.name")}</span>
        </div>

        <div className="portal-header-actions">
          <Link to="/settings" className="icon-btn ghost" title={t("common.settings")}>
            <Icon name="user" size={16} />
            <span className="visually-hidden">{t("common.settings")}</span>
          </Link>

          <button
            type="button"
            className="icon-btn ghost"
            title={t("theme.toggle")}
            aria-label={t("theme.toggle")}
            onClick={toggle}
          >
            <Icon name={isDark ? "sun" : "moon"} size={16} />
          </button>
        </div>
      </header>

      <main className="portal-body">
        <div className="portal-hero">
          <div className="hero-eyebrow">{t("portal.eyebrow")}</div>
          <h1 className="portal-title">{t("portal.title")}</h1>
          <p className="portal-subtitle">{t("portal.subtitle")}</p>
        </div>

        <div className="portal-grid">
          <div className="portal-card plain">
            <div className="card-top">
              <div className="card-icon-wrapper">
                <Icon name="file" size={32} />
              </div>
              <div className="card-title-group">
                <h3>{t("portal.plainTitle")}</h3>
                <p className="card-description">{t("portal.plainBody")}</p>
              </div>
            </div>
            <div className="card-bottom">
              <button
                type="button"
                className="primary card-action-btn"
                onClick={() => navigate("/n/plain")}
              >
                <span>{t("portal.openPlain")}</span>
                <Icon name="chevron-right" size={16} />
              </button>
            </div>
          </div>

          <div className="portal-card encrypted">
            <div className="card-top">
              <div className="card-icon-wrapper">
                <Icon name={notebook.unlocked ? "unlock" : "lock"} size={32} />
              </div>
              <div className="card-title-group">
                <h3>{t("portal.encryptedTitle")}</h3>
                <p className="card-description">{t("portal.encryptedBody")}</p>
              </div>
            </div>
            <div className="card-bottom">
              <button
                type="button"
                className="card-action-btn"
                onClick={openEncrypted}
                disabled={notebook.loading}
              >
                <span>
                  {hasProfile ? t("portal.unlockEncrypted") : t("portal.createEncrypted")}
                </span>
                <Icon name="chevron-right" size={16} />
              </button>
            </div>
          </div>
        </div>
      </main>

      <footer className="portal-footer">{t("portal.footer")}</footer>

      {showUnlock ? (
        <UnlockDialog
          mode={hasProfile ? "unlock" : "create"}
          onCancel={() => setShowUnlock(false)}
          onSubmit={async (password) => {
            if (hasProfile) {
              const ok = await notebook.unlock(password);
              if (ok) {
                setShowUnlock(false);
                navigate("/n/encrypted");
              }
              return ok;
            }
            await notebook.create(password);
            setShowUnlock(false);
            navigate("/n/encrypted");
            return true;
          }}
        />
      ) : null}
    </div>
  );
}
