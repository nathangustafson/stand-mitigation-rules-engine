import { NavigateNext } from '@mui/icons-material'
import { Breadcrumbs as MuiBreadcrumbs, Link, Typography } from '@mui/material'
import { Link as RouterLink } from 'react-router-dom'

export interface Crumb {
  label: string
  to?: string
}

interface Props {
  items: Crumb[]
}

export default function Breadcrumbs({ items }: Props) {
  return (
    <MuiBreadcrumbs
      separator={<NavigateNext fontSize="small" />}
      sx={{ mb: 1 }}
      aria-label="breadcrumb"
    >
      {items.map((item, i) => {
        const isLast = i === items.length - 1
        if (isLast || !item.to) {
          return (
            <Typography
              key={i}
              variant="body2"
              color={isLast ? 'text.primary' : 'text.secondary'}
              sx={{ fontWeight: isLast ? 500 : 400 }}
            >
              {item.label}
            </Typography>
          )
        }
        return (
          <Link
            key={i}
            component={RouterLink}
            to={item.to}
            underline="hover"
            color="inherit"
            variant="body2"
          >
            {item.label}
          </Link>
        )
      })}
    </MuiBreadcrumbs>
  )
}
