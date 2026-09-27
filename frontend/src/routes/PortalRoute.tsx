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
          <h1 className="portal-title">{t("portal.title")}</h1>
        </div>

        <div className="portal-grid">
          {/*
            The whole card is the target. It carries no button of its own: a
            nested "Open" label looked like the only clickable part while the
            card around it already lifted on hover, so a click on the title did
            nothing. The card is a `<button>`, which also makes it reachable by
            keyboard and announced as one control.
          */}
          <button
            type="button"
            className="portal-card plain"
            onClick={() => navigate("/n/plain")}
          >
            <span className="card-top">
              <span className="card-icon-wrapper">
                <Icon name="file" size={32} />
              </span>
              <span className="card-title-group">
                <span className="card-title">{t("portal.plainTitle")}</span>
              </span>
            </span>
          </button>

          <button
            type="button"
            className="portal-card encrypted"
            onClick={openEncrypted}
            disabled={notebook.loading}
          >
            <span className="card-top">
              <span className="card-icon-wrapper">
                <Icon name={notebook.unlocked ? "unlock" : "lock"} size={32} />
              </span>
              <span className="card-title-group">
                <span className="card-title">{t("portal.encryptedTitle")}</span>
              </span>
            </span>
          </button>
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
