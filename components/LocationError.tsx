interface Props {
  message: string;
  onRetry: () => void;
}

export default function LocationError({ message, onRetry }: Props) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center gap-4 px-4">
      <div className="w-16 h-16 rounded-full bg-red-50 flex items-center justify-center">
        <svg
          className="w-8 h-8 text-red-500"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
          />
        </svg>
      </div>
      <div>
        <h2 className="text-lg font-semibold text-gray-800 mb-1">
          Something went wrong
        </h2>
        <p className="text-sm text-gray-500 max-w-xs">{message}</p>
      </div>
      <button
        onClick={onRetry}
        className="mt-2 inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 active:bg-blue-800 transition-colors"
      >
        <svg
          className="w-4 h-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
          />
        </svg>
        Try again
      </button>
    </div>
  );
}
