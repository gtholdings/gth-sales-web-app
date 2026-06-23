'use client';

import { useRouter } from 'next/navigation';
import { Navbar } from '@/components/Navbar';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { SalesForm } from '@/components/SalesForm';

export default function NewSalePage() {
  const router = useRouter();

  const handleSuccess = () => {
    router.push('/dashboard');
  };

  return (
    <ProtectedRoute allowedRoles={['rep', 'supervisor', 'manager']}>
      <div className="min-h-screen bg-gray-50">
        <Navbar />

        <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* Page Header */}
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900">New Dialog TV Sale</h1>
            <p className="text-gray-600 mt-2">
              Enter the details below to record a new sale
            </p>
          </div>

          {/* Sales Form */}
          <SalesForm onSuccess={handleSuccess} />
        </main>
      </div>
    </ProtectedRoute>
  );
}
