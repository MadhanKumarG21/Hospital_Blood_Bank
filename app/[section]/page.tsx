import { WorkflowPage } from '@/components/workflow-page'

export function generateStaticParams() {
  return ['collections','testing','inventory','requests','issues','discards','camps','reports','audit-log','settings'].map(section=>({section}))
}

export default async function SectionPage({ params, searchParams }: { params: Promise<{section:string}>; searchParams: Promise<{new?:string}> }) {
  const [{section}, query]=await Promise.all([params, searchParams])
  return <WorkflowPage section={section} initialNewRequest={query.new==='1'}/>
}
