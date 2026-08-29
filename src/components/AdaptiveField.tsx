import type { ComponentType } from "react";

import type { FieldDefinition, FieldKind } from "../domain/types";

interface FieldControlProps {
  field: FieldDefinition;
  label: string;
  helpText: string;
  value: unknown;
  large: boolean;
  error?: string;
  onChange(value: unknown): void;
}

const FieldError = ({ id, error }: { id: string; error?: string }) =>
  error ? (
    <p className="field-error" id={id}>
      {error}
    </p>
  ) : null;

const describedBy = (fieldId: string, error?: string) =>
  `adaptive-${fieldId}-help${error ? ` adaptive-${fieldId}-error` : ""}`;

const InputField = ({ field, label, helpText, value, error, onChange }: FieldControlProps) => (
  <div className="field-stack">
    <label htmlFor={`adaptive-${field.id}`}>{label}</label>
    <p id={`adaptive-${field.id}-help`}>{helpText}</p>
    <input
      id={`adaptive-${field.id}`}
      aria-describedby={describedBy(field.id, error)}
      aria-invalid={Boolean(error)}
      type="text"
      value={String(value ?? "")}
      required={field.required}
      onChange={(event) => onChange(event.target.value)}
    />
    <FieldError id={`adaptive-${field.id}-error`} error={error} />
  </div>
);

const EmailField = (props: FieldControlProps) => (
  <div className="field-stack">
    <label htmlFor={`adaptive-${props.field.id}`}>{props.label}</label>
    <p id={`adaptive-${props.field.id}-help`}>{props.helpText}</p>
    <input
      id={`adaptive-${props.field.id}`}
      aria-describedby={describedBy(props.field.id, props.error)}
      aria-invalid={Boolean(props.error)}
      type="email"
      value={String(props.value ?? "")}
      required={props.field.required}
      onChange={(event) => props.onChange(event.target.value)}
    />
    <FieldError id={`adaptive-${props.field.id}-error`} error={props.error} />
  </div>
);

const DateField = (props: FieldControlProps) => (
  <div className="field-stack">
    <label htmlFor={`adaptive-${props.field.id}`}>{props.label}</label>
    <p id={`adaptive-${props.field.id}-help`}>{props.helpText}</p>
    <input
      id={`adaptive-${props.field.id}`}
      aria-describedby={describedBy(props.field.id, props.error)}
      aria-invalid={Boolean(props.error)}
      type="date"
      value={String(props.value ?? "")}
      required={props.field.required}
      onChange={(event) => props.onChange(event.target.value)}
    />
    <FieldError id={`adaptive-${props.field.id}-error`} error={props.error} />
  </div>
);

const SelectField = (props: FieldControlProps) => (
  <div className="field-stack">
    <label htmlFor={`adaptive-${props.field.id}`}>{props.label}</label>
    <p id={`adaptive-${props.field.id}-help`}>{props.helpText}</p>
    <select
      id={`adaptive-${props.field.id}`}
      aria-describedby={describedBy(props.field.id, props.error)}
      aria-invalid={Boolean(props.error)}
      value={String(props.value ?? "")}
      required={props.field.required}
      onChange={(event) => props.onChange(event.target.value)}
    >
      <option value="">Choose an option</option>
      {props.field.options?.map((option) => (
        <option key={String(option.value)} value={String(option.value)}>
          {option.label}
        </option>
      ))}
    </select>
    <FieldError id={`adaptive-${props.field.id}-error`} error={props.error} />
  </div>
);

const RadioCardsField = ({
  field,
  label,
  helpText,
  value,
  large,
  error,
  onChange,
}: FieldControlProps) => (
  <fieldset
    className="adaptive-fieldset"
    aria-describedby={describedBy(field.id, error)}
    aria-invalid={Boolean(error)}
  >
    <legend>{label}</legend>
    <p id={`adaptive-${field.id}-help`}>{helpText}</p>
    <div className="adaptive-choices">
      {field.options?.map((option) => (
        <label
          className={`choice-tile ${large ? "large-card-control" : ""}`}
          key={String(option.value)}
        >
          <input
            id={`adaptive-${field.id}-${String(option.value)}`}
            type="radio"
            name={`adaptive-${field.id}`}
            aria-label={option.label}
            aria-describedby={describedBy(field.id, error)}
            aria-invalid={Boolean(error)}
            checked={String(value ?? "") === String(option.value)}
            onChange={() => onChange(option.value)}
          />
          <span>
            <strong>{option.label}</strong>
          </span>
        </label>
      ))}
    </div>
    <FieldError id={`adaptive-${field.id}-error`} error={error} />
  </fieldset>
);

const SummaryCard = ({ field, label, helpText, value }: FieldControlProps) => (
  <section className="adaptive-summary" aria-labelledby={`adaptive-${field.id}-title`}>
    <p className="eyebrow">Trusted portal record</p>
    <h2 id={`adaptive-${field.id}-title`}>{label}</h2>
    <p>{helpText}</p>
    {value && typeof value === "object" ? (
      <dl>
        {Object.entries(value as Record<string, unknown>).map(([key, item]) => (
          <div key={key}>
            <dt>{key.replace(/([A-Z])/g, " $1")}</dt>
            <dd>{String(item)}</dd>
          </div>
        ))}
      </dl>
    ) : (
      <p>{String(value ?? "Record available")}</p>
    )}
  </section>
);

const CheckboxField = ({ field, label, helpText, value, large, onChange }: FieldControlProps) => (
  <label className={`checkbox-row ${large ? "large-card-control" : ""}`}>
    <input
      id={`adaptive-${field.id}`}
      type="checkbox"
      checked={Boolean(value)}
      onChange={(event) => onChange(event.target.checked)}
    />
    <span>
      <strong>{label}</strong>
      <small>{helpText}</small>
    </span>
  </label>
);

const componentRegistry: Record<FieldKind, ComponentType<FieldControlProps>> = {
  text: InputField,
  email: EmailField,
  date: DateField,
  select: SelectField,
  radio: RadioCardsField,
  readonly_summary: SummaryCard,
  boolean: CheckboxField,
};

type AdaptiveFieldProps = FieldControlProps;

export const AdaptiveField = (props: AdaptiveFieldProps) => {
  const FieldComponent = componentRegistry[props.field.kind];
  return <FieldComponent {...props} />;
};
