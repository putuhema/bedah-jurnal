"use client"

import * as React from "react"

import { createRoom, type CreateRoomState } from "@/app/actions"
import { Button } from "@/components/ui/button"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"

export function CreateRoomForm({ needsCode }: { needsCode: boolean }) {
  const [state, action, pending] = React.useActionState<
    CreateRoomState,
    FormData
  >(createRoom, {})

  return (
    <form action={action} className="flex flex-col gap-5">
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="nameA" className="text-reader-a">
            Nama kamu
          </FieldLabel>
          <Input
            id="nameA"
            name="nameA"
            required
            maxLength={24}
            placeholder="Putu"
            autoComplete="off"
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="nameB" className="text-reader-b">
            Nama dia
          </FieldLabel>
          <Input
            id="nameB"
            name="nameB"
            required
            maxLength={24}
            placeholder="S"
            autoComplete="off"
          />
          <FieldDescription>Kamu biru, dia ungu.</FieldDescription>
        </Field>
        {needsCode && (
          <Field>
            <FieldLabel htmlFor="code">Kode pembuatan ruang</FieldLabel>
            <Input
              id="code"
              name="code"
              type="password"
              required
              autoComplete="off"
            />
          </Field>
        )}
        {state.error && <FieldError>{state.error}</FieldError>}
      </FieldGroup>
      <Button type="submit" size="lg" disabled={pending}>
        {pending && <Spinner data-icon="inline-start" />}
        Bikin ruang baca
      </Button>
    </form>
  )
}
