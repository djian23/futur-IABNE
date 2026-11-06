import React, { useState } from "react";
import { ArrowUpRight } from "lucide-react";

const title = (o) => o?.title || o?.name || o?.label || "";
export { title };
export function Form({
  children,
  onSubmit,
  submit = "Enregistrer",
  disabled = false,
  className = "",
}) {
  const [sending, setSending] = useState(false),
    [error, setError] = useState("");
  return (
    <form
      className={"form " + className}
      onSubmit={async (e) => {
        e.preventDefault();
        const form = e.currentTarget;
        setSending(true);
        setError("");
        try {
          await onSubmit(Object.fromEntries(new FormData(form)), form);
        } catch (err) {
          setError(err.message);
        } finally {
          setSending(false);
        }
      }}
    >
      {children}
      {error && (
        <div className="alert error" role="alert">
          {error}
        </div>
      )}
      <button className="button" disabled={disabled || sending} type="submit">
        {sending ? "En cours…" : submit}
        <ArrowUpRight size={16} />
      </button>
    </form>
  );
}
export function Field({ label, children, ...props }) {
  const id = React.useId();
  return (
    <label className="field" htmlFor={id}>
      <span id={`${id}-label`}>{label}</span>
      {React.isValidElement(children)
        ? React.cloneElement(children, { id, "aria-labelledby": `${id}-label` })
        : children || (
            <input {...props} id={id} aria-labelledby={`${id}-label`} />
          )}
    </label>
  );
}
export function Select({
  label,
  name,
  items,
  value,
  onChange,
  empty = "Choisir…",
  required = true,
}) {
  return (
    <Field label={label}>
      <select name={name} value={value} onChange={onChange} required={required}>
        <option value="">{empty}</option>
        {items.map((i) => (
          <option key={i.id} value={i.id}>
            {title(i)}
          </option>
        ))}
      </select>
    </Field>
  );
}
