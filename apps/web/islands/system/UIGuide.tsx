import { Badge, CopyButton, Dropdown, PageTitle, Table } from "@web/islands"
import * as icons from "@client/icons"
import { useSignal } from "@preact/signals"
// import { state } from "@web/state"
import {
  IconArrowLeft,
  IconEllipsisVertical,
  IconLoading,
  IconPencilSquare,
  IconPlus,
} from "@client/icons"
import { navigate } from "@client/helpers"

export function UIGuide() {
  const iconSearch = useSignal("")
  return (
    <div class="page-layout">
      <PageTitle>UI Guide</PageTitle>

      <p>
        For standart page width use class
        <span class="mx-2 border border-purple-600 text-purple-600 text-sm py-0.5 px-1.5 rounded-primary">
          .page-layout
        </span>
      </p>

      <div class="flex flex-wrap items-center gap-2">
        <button type="button" class="btn btn-primary">Primary</button>
        <button type="button" class="btn btn-primary-outline">
          Outline
        </button>
        <button type="button" class="btn btn-danger">Danger</button>
        <button type="button" class="btn btn-danger-outline">
          Outline
        </button>
        <button type="button" class="btn btn-warning">Warning</button>
        <button type="button" class="btn btn-warning-outline">
          Outline
        </button>
        <button type="button" class="btn btn-success">Success</button>
        <button type="button" class="btn btn-success-outline">
          Outline
        </button>
      </div>

      <div class="flex flex-wrap items-center gap-2">
        <button type="button" class="btn btn-primary btn-icon">
          <IconPlus class="size-6" />
        </button>
        <button type="button" class="btn btn-primary-outline btn-icon">
          <IconPlus class="size-6" />
        </button>
        <button type="button" class="btn btn-danger btn-icon">
          <IconPlus class="size-6" />
        </button>
        <button type="button" class="btn btn-danger-outline btn-icon">
          <IconPlus class="size-6" />
        </button>
        <button type="button" class="btn btn-success btn-icon">
          <IconPlus class="size-6" />
        </button>
        <button type="button" class="btn btn-success-outline btn-icon">
          <IconPlus class="size-6" />
        </button>
        <button
          type="button"
          class="btn btn-primary transition ease-in-out duration-150 cursor-not-allowed"
        >
          <IconLoading class="animate-spin -ml-1 mr-1 size-5 text-white" /> Processing...
        </button>
        <div class="ml-10">
          <a href="javascript:;" class="btn-link">
            <IconPencilSquare /> Link
          </a>
        </div>
      </div>

      <div class="flex flex-wrap items-start gap-2 lg:gap-x-20">
        <label class="label">
          <input
            type="checkbox"
            class="checkbox mr-2"
          />
          Checkbox
        </label>

        <fieldset>
          <div class="space-y-6 sm:flex sm:items-center sm:space-x-10 sm:space-y-0">
            <div class="flex items-center gap-2">
              <input
                id="email"
                name="notification-method"
                type="radio"
                checked
                class="radio"
              />
              <label for="email" class="label">
                Email
              </label>
            </div>
            <div class="flex items-center gap-2">
              <input
                id="sms"
                name="notification-method"
                type="radio"
                class="radio"
              />
              <label for="sms" class="label">
                Phone (SMS)
              </label>
            </div>
            <div class="flex items-center gap-2">
              <input
                id="push"
                name="notification-method"
                type="radio"
                class="radio"
              />
              <label for="push" class="label">
                Push notification
              </label>
            </div>
          </div>
        </fieldset>
      </div>

      <div class="flex flex-wrap items-start gap-2">
        <div class="w-60">
          <label class="label">
            Label name
          </label>
          <div class="mt-2">
            <input
              type="text"
              class="input"
              placeholder="With placeholder"
            />
            <p class="mt-2 text-sm text-gray-500">Help text if we need it.</p>
          </div>
        </div>
        <div class="w-60">
          <label class="label">
            Input with CopyButton
          </label>
          <div class="mt-2 relative">
            <input
              type="text"
              id="device-id"
              class="input pr-11"
            />
            <div class="absolute top-1.5 right-1.5">
              <CopyButton textToCopy="Text Example" />
            </div>
          </div>
        </div>
        <div class="w-60">
          <label class="label">
            Select
          </label>
          <div class="mt-2">
            <select
              id="role"
              class="input"
            >
              <option>One</option>
              <option>Two</option>
            </select>
          </div>
        </div>
      </div>

      <div class="flex flex-wrap items-top gap-2">
        <div class="w-60">
          <label class="label">
            Textarea
          </label>
          <div class="mt-2">
            <textarea class="textarea" />
          </div>
        </div>

        <div class="w-60">
          <label class="label">
            Card
          </label>
          <div class="mt-2 h-full">
            <div class="card h-24 flex justify-center items-center text-gray-600 text-xs">
              Example of .card
            </div>
          </div>
        </div>

        <div class="w-60">
          <label class="label">
            Dropdown
          </label>
          <div class="mt-2 card h-24 flex justify-center items-center">
            <Dropdown button={<IconEllipsisVertical />}>
              <div class="divide-y divide-gray-100">
                <div class="py-1" role="none">
                  <a
                    href="javascript:;"
                    class="flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                  >
                    Edit
                  </a>
                </div>
                <div class="py-1" role="none">
                  <a
                    href="javascript:;"
                    class="flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                  >
                    Metrics
                  </a>

                  <a
                    href="javascript:;"
                    class="flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                  >
                    Commands
                  </a>

                  <a
                    href="javascript:;"
                    class="flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                  >
                    Zones
                  </a>
                </div>
                <div class="py-1" role="none">
                  <button
                    type="button"
                    class="w-full flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                  >
                    <span class="text-red-600">Delete</span>
                  </button>
                </div>
              </div>
            </Dropdown>
          </div>
          <div class="text-gray-600 text-xs p-1 flex">
            <span class="text-red-600 mr-1">*</span>
            <div>
              Dropdown should have
              <span class="text-purple-600 px-1">
                type="last"
              </span>
              if located in last 2 rows of table
            </div>
          </div>
        </div>
      </div>

      <div class="space-y-2">
        <div class="flex flex-wrap items-center gap-2">
          <Badge text="Badge red" color="red" />

          <Badge text="Badge orange" color="orange" />

          <Badge text="Badge green" color="green" />

          <Badge text="Badge gray" color="gray" />

          <Badge text="Badge blue" color="blue" />

          <Badge text="Badge purple" />

          <Badge text="purpleNav" color="purpleNav" />
        </div>

        <div class="flex flex-wrap items-center gap-2">
          <Badge type="outline" text="Outline red" color="red" />
          <Badge type="outline" text="Outline orange" color="orange" />
          <Badge type="outline" text="Outline green" color="green" />
          <Badge type="outline" text="Outline gray" color="gray" />
          <Badge type="outline" text="Outline blue" color="blue" />
          <Badge type="outline" text="Outline purple" />
          <Badge type="outline" text="purpleNav" color="purpleNav" />
        </div>
      </div>

      <div>
        <div class="flex gap-6">
          <button
            title="Back to Lampboxes"
            class="hover:text-primary self-start xl:self-auto"
            onClick={() => navigate("/devices/lamp-boxes")}
          >
            <IconArrowLeft class="size-6" />
          </button>
        </div>
      </div>

      <div>
        <p class="mb-4">
          For table use component
          <span class="mx-2 border border-purple-600 text-purple-600 text-sm py-0.5 px-1.5 rounded-primary">
            Table
          </span>
          with
          <span class="text-purple-600 text-sm py-0.5 px-1.5">
            headerSlot
          </span>
          and
          <span class="text-purple-600 text-sm py-0.5 px-1.5">
            bodySlot
          </span>
        </p>
        <Table
          headerSlot={
            <>
              <th class="text-left" scope="col">Name</th>
              <th class="text-right" scope="col">Actions</th>
            </>
          }
          bodySlots={[
            (
              <>
                <td class="text-gray-900">
                  <a
                    href="javascript:;"
                    class="hover:underline"
                  >
                    Name
                  </a>
                </td>
                <td class="relative whitespace-nowrap py-4 pl-3 pr-4 text-right sm:pr-6">
                  <a
                    href="javascript:;"
                    class="btn-link"
                  >
                    Edit
                  </a>
                </td>
              </>
            ),
          ]}
        />
      </div>

      <div>
        <p class="mb-4">Form for adding new items</p>
        <form class="card">
          <fieldset>
            <div class="card-body">
              <div class="grid grid-cols-1 gap-x-6 gap-y-8 sm:grid-cols-6"></div>
            </div>
            <div class="card-footer">
              <button type="button" class="btn btn-danger">
                Delete
              </button>
              <a href="javascript:;" class="btn btn-link ml-auto">Cancel</a>
              <button type="submit" class="btn btn-primary">Save</button>
            </div>
          </fieldset>
        </form>
      </div>

      <div>
        <div class="flex items-center gap-6">
          <h2 class="h2">Icons</h2>
          <input
            class="input my-3 w-60"
            placeholder="Search icons"
            value={iconSearch}
            onInput={(e) => iconSearch.value = e.currentTarget.value}
          />
          <span class="text-sm text-gray-500">
            Click on an icon to copy it
          </span>
        </div>
        <div class="flex items-center gap-4 flex-wrap">
          {Object.entries(icons).filter(
            ([name]) =>
              name.toLowerCase().includes(
                iconSearch.value.toLowerCase(),
              ),
          ).map(([name, Icon]) => (
            <button
              // onClick={() => state.clipboard.copy(`<${name} />`)}
              type="button"
              class="text-gray-600"
            >
              <div class="card flex items-center justify-center w-32 h-20 hover:cursor-pointer group">
                <Icon class="size-6 group-hover:scale-125 transition-transform duration-300" />
              </div>
              <span class="text-xs mt-2">
                {name.replace(/^Icon/, "")}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
