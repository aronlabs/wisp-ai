<script lang="ts">
  let {
    label,
    checked,
    disabled = false,
    onchange,
  }: {
    label: string;
    checked: boolean;
    disabled?: boolean;
    onchange: (checked: boolean) => void;
  } = $props();
</script>

<label class="switch">
  <input
    type="checkbox"
    aria-label={label}
    {checked}
    {disabled}
    onchange={(event) => onchange(event.currentTarget.checked)}
  />
  <span></span>
</label>
