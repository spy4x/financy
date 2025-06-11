export function UIGuideEditor() {
  return (
    <div>
      <h2 class="border-b-1 pb-1 mb-4">Editor</h2>
      <form class="card">
        <fieldset>
          <div class="card-body">
            <div class="grid grid-cols-1 gap-x-6 gap-y-8 sm:grid-cols-6">
              <p>Inputs go here...</p>
            </div>
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
  )
}
