export default function Spinner({
  size = "md",
  color = "border-blue-600",
}: {
  size?: "sm" | "md" | "lg"
  color?: string
}) {
  const sizeClass =
    size === "sm" ? "w-4 h-4" : size === "lg" ? "w-8 h-8" : "w-6 h-6"
  return (
    <div
      className={`${sizeClass} border-2 ${color} border-t-transparent rounded-full animate-spin`}
    />
  )
}