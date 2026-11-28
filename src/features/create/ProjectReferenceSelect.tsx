import { Field, Select } from '../../components/ui/Field';
import { useWorkspace } from '../../state/workspaceContext';
import { t } from '../../i18n/translate';

interface ProjectReferenceSelectProps {
  value: string;
  error?: string | undefined;
  onChange: (value: string) => void;
}

export function ProjectReferenceSelect({ value, error, onChange }: ProjectReferenceSelectProps) {
  const { projects } = useWorkspace();
  // Archived projects are hidden, unless the item being edited already belongs to one.
  const choices = projects.filter((project) => project.status !== 'archived' || project.id === value);
  return (
    <Field label={t('Project')} optional error={error}>
      {(field) => (
        <Select {...field} value={value} onChange={(event) => onChange(event.target.value)}>
          <option value="">{t('No project')}</option>
          {choices.map((project) => (
            <option key={project.id} value={project.id}>
              {project.name}
            </option>
          ))}
        </Select>
      )}
    </Field>
  );
}
