import * as RadixSelect from '@radix-ui/react-select';
import { ChevronDown } from 'lucide-react';

export type SelectOption = {
  value: string;
  label: string;
  disabled?: boolean;
};

export function Select({
  value,
  options,
  onChange,
  'aria-label': ariaLabel,
  disabled = false,
  className = '',
  placeholder
}: {
  value: string;
  options: SelectOption[];
  onChange?: (value: string) => void;
  'aria-label'?: string;
  disabled?: boolean;
  className?: string;
  placeholder?: string;
}) {
  return (
    <RadixSelect.Root value={value} onValueChange={(nextValue) => onChange?.(nextValue)} disabled={disabled}>
      <RadixSelect.Trigger className={`app-select-trigger ${className}`.trim()} aria-label={ariaLabel}>
        <RadixSelect.Value placeholder={placeholder} />
        <RadixSelect.Icon aria-hidden="true"><ChevronDown size={14} /></RadixSelect.Icon>
      </RadixSelect.Trigger>
      <RadixSelect.Portal>
        <RadixSelect.Content className="app-select-content" position="popper" sideOffset={4}>
          <RadixSelect.Viewport>
            {options.map((option) => (
              <RadixSelect.Item key={option.value} value={option.value} disabled={option.disabled} className="app-select-item">
                <RadixSelect.ItemText>{option.label}</RadixSelect.ItemText>
              </RadixSelect.Item>
            ))}
          </RadixSelect.Viewport>
        </RadixSelect.Content>
      </RadixSelect.Portal>
    </RadixSelect.Root>
  );
}
