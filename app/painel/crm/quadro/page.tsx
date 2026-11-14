// O quadro virou a tela principal do CRM (/painel/crm).
import { redirect } from 'next/navigation';

export default function QuadroAntigo() {
  redirect('/painel/crm');
}
