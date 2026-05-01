import { useEffect, useState } from 'react'
import { TextField } from '@mui/material'

interface Props {
  label: string
  value: unknown
  onChange: (next: unknown, valid: boolean) => void
  helperText?: string
  rows?: number
}

export default function JsonEditor({ label, value, onChange, helperText, rows = 8 }: Props) {
  const [text, setText] = useState(() => JSON.stringify(value ?? null, null, 2))
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setText(JSON.stringify(value ?? null, null, 2))
    setError(null)
  }, [value])

  const handle = (next: string) => {
    setText(next)
    try {
      const parsed = next.trim() === '' ? null : JSON.parse(next)
      setError(null)
      onChange(parsed, true)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      onChange(null, false)
    }
  }

  return (
    <TextField
      fullWidth
      multiline
      minRows={rows}
      label={label}
      value={text}
      onChange={(e) => handle(e.target.value)}
      error={Boolean(error)}
      helperText={error ?? helperText}
      InputProps={{ sx: { fontFamily: 'monospace', fontSize: 13 } }}
    />
  )
}
