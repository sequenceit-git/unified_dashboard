export default function Button({ variant = 'primary', size = 'md', className = '', ...props }) {
  const variants = {
    primary: 'bg-indigo-600 text-white hover:bg-indigo-700',
    secondary: 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50',
    danger: 'bg-red-600 text-white hover:bg-red-700',
    ghost: 'text-gray-600 hover:bg-gray-100',
  }
  const sizes = { sm: 'px-2.5 py-1.5 text-xs', md: 'px-4 py-2 text-sm', lg: 'px-5 py-2.5 text-sm' }
  return (
    <button
      className={`rounded-lg font-medium transition disabled:opacity-50 ${variants[variant]} ${sizes[size]} ${className}`}
      {...props}
    />
  )
}
