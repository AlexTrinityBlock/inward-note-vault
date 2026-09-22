import { Icon, type IconName } from "../Icon";

type EmptyStateProps = {
  title: string;
  body: string;
  icon?: IconName;
  children?: React.ReactNode;
};

/** Shown when a folder holds nothing, or a search matches nothing. */
export function EmptyState({ title, body, icon = "folder", children }: EmptyStateProps) {
  return (
    <div className="drive-empty-state">
      <div className="drive-empty-icon">
        <Icon name={icon} size={48} />
      </div>
      <h4>{title}</h4>
      <p>{body}</p>
      {children ? <div className="drive-empty-actions">{children}</div> : null}
    </div>
  );
}
