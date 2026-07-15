import React from 'react';
import { BookOpen } from 'lucide-react';
import Navbar from '../components/Navbar';
import { Footer } from '../components/Footer';

export default function Manuais() {
  return (
    <div className="flex min-h-screen flex-col bg-[#f7f4ed] text-gray-900">
      <Navbar />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6 lg:px-8">
        <section className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="rounded-md bg-dourado-50 p-3 text-dourado-700">
              <BookOpen className="h-6 w-6" />
            </div>
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-dourado-700">MCom</p>
              <h1 className="mt-2 text-3xl font-bold text-gray-950">Manuais</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-600">
                Em breve os manuais das equipes ficarão disponíveis aqui para consulta rápida.
              </p>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
