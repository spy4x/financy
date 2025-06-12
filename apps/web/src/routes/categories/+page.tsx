import { CategoryCreate } from "./create.tsx"
import { CategoryList } from "./list.tsx"

export default function CategoriesPage() {
  return (
    <div class="container mx-auto p-4">
      <h1 class="text-2xl font-bold mb-4">Categories</h1>
      <CategoryCreate />
      <CategoryList />
    </div>
  )
}
