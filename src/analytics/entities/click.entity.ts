import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('clicks')
@Index(['short_code', 'clicked_at']) // Composite index for time-series queries [cite: 81, 94]
export class Click {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: string;

  @Column({ length: 10 })
  short_code: string;
  // [cite: 80]

  @CreateDateColumn()
  clicked_at: Date;
  // [cite: 80]

  @Column({ length: 45, nullable: true })
  ip_address: string;
  // [cite: 80]

  @Column('text', { nullable: true })
  user_agent: string;
  // [cite: 80]

  @Column('text', { nullable: true })
  referrer: string;
  // [cite: 80]

  @Column({ length: 2, nullable: true })
  country: string;
  // [cite: 80]
}
