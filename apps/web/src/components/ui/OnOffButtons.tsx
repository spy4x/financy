type Props = {
  value?: boolean
  amount?: { on: number; off: number }
  onSwitch: (on: boolean) => void
}

export function OnOffButtons({ onSwitch, value, amount }: Props) {
  return (
    <div class="isolate inline-flex">
      <button
        onClick={() => onSwitch(true)}
        type="button"
        class={`btn btn-primary-outline rounded-r-none flex flex-col ${
          value === true ? "bg-primary text-white" : ""
        }`}
      >
        <span>ON</span>
        {amount && <span class="text-small">{amount.on}</span>}
      </button>
      <button
        onClick={() => onSwitch(false)}
        type="button"
        class={`btn btn-primary-outline rounded-l-none -ml-px flex flex-col ${
          value === false ? "bg-primary text-white" : ""
        }`}
      >
        <span>OFF</span>
        {amount && <span class="text-small ">{amount.off}</span>}
      </button>
    </div>
  )
}
