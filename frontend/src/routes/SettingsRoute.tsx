import { useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";

import {
  useGetSettings,
  useUpdateSettings,
  useVerifyTypesafeKey,
} from "../client/generated";
import { useI18n } from "../i18n";

/** Account, TypeSafe key, auto-classification, and how the encryption works. */
export function SettingsRoute() {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const settings = useGetSettings();
  const update = useUpdateSettings();
  const verify = useVerifyTypesafeKey();

  const [draftKey, setDraftKey] = useState("");
  const [draftModel, setDraftModel] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [verifyResult, setVerifyResult] = useState<string | null>(null);

  const configured = settings.data?.typesafe_configured ?? false;
  const model = draftModel ?? settings.data?.typesafe_model ?? "";

  async function submit(event: FormEvent) {
    event.preventDefault();
    setStatus(null);
    try {
      await update.mutateAsync({
        data: {
          typesafe_api_key: draftKey.trim() === "" ? undefined : draftKey.trim(),
          typesafe_model: model,
          auto_classify_enabled: settings.data?.auto_classify_enabled,
        },
      });
      setDraftKey("");
      setStatus(t("settings.saved"));
      await queryClient.invalidateQueries();
    } catch {
      setStatus(t("settings.saveFailed"));
    }
  }

  async function removeKey() {
    await update.mutateAsync({ data: { clear_typesafe_api_key: true } });
    setVerifyResult(null);
    setStatus(t("settings.saved"));
    await queryClient.invalidateQueries();
  }

  async function toggleAutoClassify(enabled: boolean) {
    await update.mutateAsync({ data: { auto_classify_enabled: enabled } });
    await queryClient.invalidateQueries();
  }

  async function testKey() {
    setVerifyResult(null);
    try {
      const result = await verify.mutateAsync();
      setVerifyResult(
        result.ok
          ? `${t("settings.verifyOk")} ${(result.models ?? []).join(", ")}`
          : `${t("settings.verifyFailed")} ${result.detail ?? ""}`,
      );
    } catch {
      setVerifyResult(t("settings.verifyFailed"));
    }
  }

  if (settings.isPending) {
    return <p className="muted">{t("common.loading")}</p>;
  }

  return (
    <form className="settings" onSubmit={submit}>
      <section className="panel">
        <h2>{t("settings.typesafe")}</h2>
        <p className="muted small">
          {configured ? t("settings.apiKeyStored") : t("settings.apiKeyMissing")}
        </p>

        <label>
          {t("settings.apiKey")}
          <input
            value={draftKey}
            onChange={(event) => setDraftKey(event.target.value)}
            placeholder="ts_…"
            autoComplete="off"
          />
        </label>

        <label>
          {t("settings.model")}
          <input
            value={model}
            onChange={(event) => setDraftModel(event.target.value)}
            placeholder="jev-latest"
          />
          <span className="hint">{t("settings.modelHint")}</span>
        </label>

        <label className="checkbox">
          <input
            type="checkbox"
            checked={settings.data?.auto_classify_enabled ?? false}
            onChange={(event) => void toggleAutoClassify(event.target.checked)}
          />
          {t("settings.autoClassify")}
        </label>
        <p className="hint">{t("settings.autoClassifyHint")}</p>

        <div className="row">
          <button type="submit" className="primary" disabled={update.isPending}>
            {t("common.save")}
          </button>
          <button type="button" onClick={() => void testKey()} disabled={!configured || verify.isPending}>
            {verify.isPending ? t("settings.verifying") : t("settings.verify")}
          </button>
          {configured ? (
            <button type="button" className="danger" onClick={() => void removeKey()}>
              {t("settings.clearKey")}
            </button>
          ) : null}
          {status ? <span className="muted small">{status}</span> : null}
        </div>
        {verifyResult ? <p className="muted small">{verifyResult}</p> : null}
      </section>

      <section className="panel">
        <h2>{t("settings.encryption")}</h2>
        <p>{t("settings.encryptionBody")}</p>
        <p className="hint">{t("settings.metadataWarning")}</p>
      </section>
    </form>
  );
}
