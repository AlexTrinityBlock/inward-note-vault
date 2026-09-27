import { Fragment } from "react";

type Crumb = {
  label: string;
  onClick?: () => void;
};

/**
 * `My Vault > Parent > Current`, with the category segment appended when the
 * drive is showing a category drill-down.
 *
 * The last crumb is never a link: it names where you already are.
 */
export function Breadcrumbs({ trail }: { trail: Crumb[] }) {
  return (
    <nav className="drive-breadcrumbs" aria-label="Breadcrumb">
      {trail.map((crumb, index) => {
        const isLast = index === trail.length - 1;
        return (
          <Fragment key={`${crumb.label}-${index}`}>
            {index > 0 ? (
              <span className="drive-crumb-sep" aria-hidden="true">
                /
              </span>
            ) : null}
            {crumb.onClick && !isLast ? (
              <button type="button" className="drive-crumb-item link" onClick={crumb.onClick}>
                {crumb.label}
              </button>
            ) : (
              <span
                className="drive-crumb-item current"
                aria-current={isLast ? "page" : undefined}
              >
                {crumb.label}
              </span>
            )}
          </Fragment>
        );
      })}
    </nav>
  );
}
